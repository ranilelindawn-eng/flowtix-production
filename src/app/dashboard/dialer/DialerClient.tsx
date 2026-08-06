'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Call, Device } from '@twilio/voice-sdk'
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Radio,
  RefreshCw,
  Send,
  StopCircle,
  UserRoundCheck,
} from 'lucide-react'

import {
  saveDialerContactUpdate,
  type DialerContact,
} from './actions'

type DialerPhoneNumber = {
  id: string
  phoneNumber: string
  friendlyName: string
  isDefault: boolean
  provider: 'twilio' | 'telnyx'
}

type DialerClientProps = {
  initialContact?: DialerContact | null
  initialPhoneNumber?: string
  callerIds?: DialerPhoneNumber[]
}

type TokenPayload = {
  provider: 'twilio' | 'telnyx'
  token: string
  userId: string
  organizationId: string
  identity: string
  expiresIn: number
}


type TelnyxCallLike = {
  id?: string
  state?: string
  direction?: string
  remotePartyNumber?: string
  options?: { remoteCallerNumber?: string }
  cause?: string
  causeCode?: number | string
  sipCode?: number | string
  sipReason?: string
  on?: (event: string, handler: (payload?: unknown) => void) => TelnyxCallLike
  answer?: () => void | Promise<void>
  hangup?: () => void | Promise<void>
  hold?: () => void | Promise<void>
  unhold?: () => void | Promise<void>
  muteAudio?: () => void
  unmuteAudio?: () => void
  sendDigits?: (digits: string) => void
  dtmf?: (digits: string) => void
  transfer?: (target: string) => void | Promise<void>
}

type TelnyxNotification = {
  type?: string
  call?: TelnyxCallLike
  error?: unknown
  errorName?: string
  errorMessage?: string
  state?: string
  sessionId?: string
}

type TelnyxErrorLike = {
  code?: number | string
  message?: string
  error?: { code?: number | string; message?: string } | Error | unknown
  sessionId?: string
  type?: string
}

type TelnyxClientLike = {
  remoteElement?: string
  connect: () => void
  disconnect: () => void
  on: (event: string, handler: (payload?: unknown) => void) => TelnyxClientLike
  newCall: (options: {
    destinationNumber: string
    callerNumber: string
    audio: boolean
    customHeaders?: Array<{ name: string; value: string }>
  }) => TelnyxCallLike
}

type DeviceState = 'offline' | 'connecting' | 'ready' | 'error'
type CallState =
  | 'idle'
  | 'incoming'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'ended'

type SaveState = 'idle' | 'saving' | 'success' | 'error'
type AgentAvailability = 'available' | 'away' | 'offline' | 'dnd'
type AgentActivityState = 'idle' | 'ringing' | 'busy' | 'wrap_up'
type PresenceSnapshot = { availability: AgentAvailability; activityState: AgentActivityState; onlineDeviceCount: number; wrapUpUntil: string | null; routable: boolean }

const keyRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

const fieldClass =
  'min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-cyan-400/50'

function describeTelnyxError(payload?: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { message: String(payload ?? 'Unknown Telnyx error') }
  }

  const event = payload as TelnyxErrorLike
  const nested = event.error
  const nestedRecord =
    nested && typeof nested === 'object' ? (nested as { code?: unknown; message?: unknown }) : null

  return {
    code: event.code ?? nestedRecord?.code ?? null,
    message:
      event.message ??
      (typeof nestedRecord?.message === 'string' ? nestedRecord.message : null) ??
      (nested instanceof Error ? nested.message : null) ??
      'Unknown Telnyx error',
    sessionId: event.sessionId ?? null,
    type: event.type ?? null,
  }
}

function getDefaultFollowUpDate() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setMinutes(0, 0, 0)

  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

export default function DialerClient({
  initialContact = null,
  initialPhoneNumber = '',
  callerIds = [],
}: DialerClientProps) {
  const [phoneNumber, setPhoneNumber] = useState(
    initialContact?.phoneNumber ?? initialPhoneNumber,
  )
  const [selectedCallerId, setSelectedCallerId] = useState(
    callerIds.find((number) => number.isDefault)?.phoneNumber ??
      callerIds[0]?.phoneNumber ??
      '',
  )
  const [deviceState, setDeviceState] = useState<DeviceState>('offline')
  const [callState, setCallState] = useState<CallState>('idle')
  const [message, setMessage] = useState(
    'Connect your browser softphone to begin.',
  )
  const [isMuted, setIsMuted] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)
  const [isRecording, setIsRecording] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [transferTarget, setTransferTarget] = useState('')
  const [incomingFrom, setIncomingFrom] = useState('')
  const [tokenPayload, setTokenPayload] = useState<TokenPayload | null>(null)
  const [availability, setAvailability] = useState<AgentAvailability>('available')
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null)
  const deviceKeyRef = useRef('')

  const [callOutcome, setCallOutcome] = useState('connected')
  const [leadStatus, setLeadStatus] = useState('contacted')
  const [callNotes, setCallNotes] = useState('')
  const [followUpAt, setFollowUpAt] = useState(getDefaultFollowUpDate)
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const deviceRef = useRef<Device | null>(null)
  const callRef = useRef<Call | null>(null)
  const telnyxClientRef = useRef<TelnyxClientLike | null>(null)
  const telnyxCallRef = useRef<TelnyxCallLike | null>(null)

  const selectedProvider =
    callerIds.find((number) => number.phoneNumber === selectedCallerId)?.provider ??
    callerIds[0]?.provider ??
    'twilio'

  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      seconds % 60,
    ).padStart(2, '0')}`

  const attachCallEvents = useCallback((call: Call, incoming = false) => {
    callRef.current = call
    setCallState(incoming ? 'incoming' : 'connecting')
    setMessage(incoming ? 'Incoming call' : 'Connecting call…')

    call.on('ringing', () => {
      setCallState('ringing')
      setMessage('Ringing…')
    })

    call.on('accept', () => {
      setCallState('connected')
      setMessage('Call connected')
      setElapsed(0)
      setSaveState('idle')
      setSaveMessage('')
    })

    call.on('disconnect', () => {
      setCallState('ended')
      setMessage('Call ended — complete the call outcome before moving on.')
      setIsMuted(false)
      setIsOnHold(false)
      callRef.current = null
      window.setTimeout(() => setCallState('idle'), 1200)
    })

    call.on('cancel', () => {
      setCallState('ended')
      setMessage('Incoming call cancelled')
      callRef.current = null
    })

    call.on('reject', () => {
      setCallState('ended')
      setMessage('Call rejected')
      callRef.current = null
    })

    call.on('error', (error: Error) => {
      setCallState('ended')
      setMessage(error.message)
      callRef.current = null
    })
  }, [])

  const handleTelnyxNotification = useCallback((payload?: unknown) => {
    const notification = payload as TelnyxNotification | undefined


    if (notification?.type !== 'callUpdate' || !notification.call) {
      if (notification?.errorMessage) setMessage(notification.errorMessage)
      return
    }

    const call = notification.call
    telnyxCallRef.current = call
    const state = String(call.state ?? '')

    if (state === 'new' || state === 'trying' || state === 'requesting') {
      setCallState('connecting')
      setMessage(`Telnyx call ${state}…`)
    } else if (state === 'ringing') {
      const inbound = call.direction === 'inbound'
      setCallState(inbound ? 'incoming' : 'ringing')
      setIncomingFrom(
        call.remotePartyNumber ?? call.options?.remoteCallerNumber ?? 'Unknown caller',
      )
      setMessage(inbound ? 'Incoming Telnyx call' : 'Ringing…')
    } else if (state === 'active') {
      setCallState('connected')
      setMessage('Call connected')
      setElapsed(0)
      setIsOnHold(false)
    } else if (state === 'held') {
      setCallState('connected')
      setIsOnHold(true)
      setMessage('Call on hold')
    } else if (['hangup', 'destroyed', 'destroy', 'purge'].includes(state)) {
      const reason =
        call.sipReason ||
        call.cause ||
        (call.sipCode ? `SIP ${call.sipCode}` : '') ||
        'Call ended'

      setCallState('ended')
      setMessage(`${reason} — complete the call outcome before moving on.`)
      setIsMuted(false)
      setIsOnHold(false)
      telnyxCallRef.current = null
      window.setTimeout(() => setCallState('idle'), 1200)
    }
  }, [])

  const updatePresence = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/telephony/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    const result = await response.json() as PresenceSnapshot & { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'Unable to update presence.')
    setPresence(result)
    setAvailability(result.availability)
    return result
  }, [])

  const sendDeviceHeartbeat = useCallback(async (status: 'online' | 'offline' | 'error') => {
    if (!deviceKeyRef.current) return
    await updatePresence({
      action: 'heartbeat',
      deviceKey: deviceKeyRef.current,
      status,
      provider: selectedProvider,
      providerIdentity: null,
      supportsInbound: true,
      metadata: { userAgent: navigator.userAgent },
    })
  }, [selectedProvider, updatePresence])

  const changeAvailability = useCallback(async (next: AgentAvailability) => {
    setAvailability(next)
    try {
      await updatePresence({ action: 'availability', availability: next })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update availability.')
    }
  }, [updatePresence])

  const fetchToken = useCallback(async (provider: 'twilio' | 'telnyx'): Promise<TokenPayload> => {
    const response = await fetch(`/api/telephony/token?provider=${provider}`, {
      cache: 'no-store',
    })
    const payload = (await response.json()) as TokenPayload & {
      error?: string
    }

    if (!response.ok) {
      throw new Error(payload.error ?? 'Unable to create voice token.')
    }

    setTokenPayload(payload)
    return payload
  }, [])

  const connectDevice = useCallback(async () => {
    setDeviceState('connecting')
    setMessage(`Connecting ${selectedProvider === 'telnyx' ? 'Telnyx' : 'Twilio'} browser softphone…`)

    try {
      await deviceRef.current?.destroy()
      deviceRef.current = null
      telnyxClientRef.current?.disconnect?.()
      telnyxClientRef.current = null
      telnyxCallRef.current = null

      if (selectedProvider === 'telnyx') {
        const [{ TelnyxRTC }, payload] = await Promise.all([
          import('@telnyx/webrtc'),
          fetchToken('telnyx'),
        ])

        const client = new TelnyxRTC({
          login_token: payload.token,
          debug: false,
          enableCallReports: true,
        }) as unknown as TelnyxClientLike
        client.remoteElement = 'flowtix-telnyx-remote-audio'
        client.on('telnyx.ready', () => {
          setDeviceState('ready')
          setMessage('Telnyx softphone ready for inbound and outbound calls.')
        })
        client.on('telnyx.error', (event?: unknown) => {
          const error = describeTelnyxError(event)
          console.error('[Flowtix Telnyx] error', error)
          setDeviceState('error')
          setMessage(error.message || 'Telnyx softphone connection failed.')
        })
        client.on('telnyx.warning', (_event?: unknown) => {
          console.warn('[Flowtix Telnyx] warning', describeTelnyxError(_event))
        })
        client.on('telnyx.socket.close', (event?: unknown) => {
          console.warn('[Flowtix Telnyx] socket closed', event)
          setDeviceState('offline')
        })
        client.on('telnyx.socket.error', (event?: unknown) => {
          console.error('[Flowtix Telnyx] socket error', event)
        })
        client.on('telnyx.stats.report', () => {
        })
        client.on('telnyx.notification', handleTelnyxNotification)
        telnyxClientRef.current = client
        setTokenPayload(payload)
        client.connect()
        return
      }

      const [{ Device: TwilioDevice }, payload] = await Promise.all([
        import('@twilio/voice-sdk'),
        fetchToken('twilio'),
      ])

      const device = new TwilioDevice(payload.token, {
        closeProtection: true,
        enableImprovedSignalingErrorPrecision: true,
        tokenRefreshMs: 30000,
      })

      device.on('registered', () => {
        setDeviceState('ready')
        setMessage('Softphone ready for inbound and outbound calls.')
        void sendDeviceHeartbeat('online')
      })
      device.on('unregistered', () => {
        setDeviceState('offline')
        void sendDeviceHeartbeat('offline')
      })
      device.on('error', (error: Error) => {
        setDeviceState('error')
        setMessage(error.message)
        void sendDeviceHeartbeat('error')
      })
      device.on('incoming', (call: Call) => {
        setIncomingFrom(call.parameters.From ?? 'Unknown caller')
        attachCallEvents(call, true)
      })
      device.on('tokenWillExpire', async () => {
        try {
          device.updateToken((await fetchToken('twilio')).token)
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : 'Token refresh failed.',
          )
        }
      })

      deviceRef.current = device
      await device.register()
    } catch (error) {
      setDeviceState('error')
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect the softphone.',
      )
    }
  }, [attachCallEvents, fetchToken, handleTelnyxNotification, selectedProvider, sendDeviceHeartbeat])

  useEffect(() => {
    const stored = window.localStorage.getItem('flowtix-agent-device-key')
    const deviceKey = stored || window.crypto.randomUUID()
    deviceKeyRef.current = deviceKey
    if (!stored) window.localStorage.setItem('flowtix-agent-device-key', deviceKey)

    const connectTimer = window.setTimeout(() => {
      void connectDevice()
    }, 0)

    return () => {
      window.clearTimeout(connectTimer)
      void sendDeviceHeartbeat('offline')
      void deviceRef.current?.destroy()
      telnyxClientRef.current?.disconnect?.()
    }
  }, [connectDevice, sendDeviceHeartbeat])

  useEffect(() => {
    if (deviceState !== 'ready') return
    void sendDeviceHeartbeat('online')
    const heartbeatTimer = window.setInterval(() => {
      void sendDeviceHeartbeat('online')
    }, 25_000)
    return () => window.clearInterval(heartbeatTimer)
  }, [deviceState, sendDeviceHeartbeat])

  useEffect(() => {
    if (!tokenPayload) return

    const activity: AgentActivityState = ['connecting', 'ringing', 'incoming'].includes(
      callState,
    )
      ? 'ringing'
      : callState === 'connected'
        ? 'busy'
        : callState === 'ended'
          ? 'wrap_up'
          : 'idle'

    const presenceTimer = window.setTimeout(() => {
      void updatePresence({
        action: 'activity',
        state: activity,
        wrapUpSeconds: 30,
      }).catch(() => undefined)
    }, 0)

    return () => window.clearTimeout(presenceTimer)
  }, [callState, tokenPayload, updatePresence])

  useEffect(() => {
    if (callState !== 'connected' || isOnHold) return

    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    )

    return () => window.clearInterval(timer)
  }, [callState, isOnHold])

  async function placeCall() {
    if (!selectedCallerId) {
      setMessage('Import and select an owned voice number before placing calls.')
      return
    }

    if (
      !tokenPayload ||
      !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())
    ) {
      setMessage('Enter a valid E.164 number, for example +14155550123.')
      return
    }

    try {
      if (selectedProvider === 'telnyx') {
        const client = telnyxClientRef.current
        if (!client) throw new Error('Telnyx softphone is not connected.')
        const destinationNumber = phoneNumber.trim()

        const call = client.newCall({
          destinationNumber,
          callerNumber: selectedCallerId,
          audio: true,
          customHeaders: [
            { name: 'X-Flowtix-Organization', value: tokenPayload.organizationId },
            { name: 'X-Flowtix-User', value: tokenPayload.userId },
          ],
        })
        telnyxCallRef.current = call
        call.on?.('telnyx.notification', handleTelnyxNotification)
        setCallState('connecting')
        setMessage('Connecting Telnyx call…')
      } else {
        if (!deviceRef.current) throw new Error('Twilio softphone is not connected.')
        const call = await deviceRef.current.connect({
          params: {
            To: phoneNumber.trim(),
            FlowtixUserId: tokenPayload.userId,
            FlowtixOrganizationId: tokenPayload.organizationId,
            ContactId: initialContact?.id ?? '',
            CallerId: selectedCallerId,
            Record: String(isRecording),
          },
        })
        attachCallEvents(call)
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to place the call.',
      )
    }
  }

  function acceptIncoming() {
    if (selectedProvider === 'telnyx') void telnyxCallRef.current?.answer?.()
    else callRef.current?.accept()
  }

  function rejectIncoming() {
    if (selectedProvider === 'telnyx') void telnyxCallRef.current?.hangup?.()
    else callRef.current?.reject()
    setCallState('idle')
  }

  function hangUp() {
    if (selectedProvider === 'telnyx') void telnyxCallRef.current?.hangup?.()
    else callRef.current?.disconnect()
  }

  function toggleMute() {
    const next = !isMuted
    if (selectedProvider === 'telnyx') {
      if (next) telnyxCallRef.current?.muteAudio?.()
      else telnyxCallRef.current?.unmuteAudio?.()
    } else {
      callRef.current?.mute(next)
    }
    setIsMuted(next)
  }

  function toggleHold() {
    const next = !isOnHold
    if (selectedProvider === 'telnyx') {
      void (next ? telnyxCallRef.current?.hold?.() : telnyxCallRef.current?.unhold?.())
      setMessage(next ? 'Call on hold' : 'Call resumed')
    } else {
      callRef.current?.mute(next)
      setMessage(next ? 'Call on hold (local audio muted)' : 'Call resumed')
    }
    setIsOnHold(next)
  }

  function sendDigit(digit: string) {
    if (callState === 'connected') {
      if (selectedProvider === 'telnyx') {
        if (typeof telnyxCallRef.current?.sendDigits === 'function') telnyxCallRef.current.sendDigits(digit)
        else telnyxCallRef.current?.dtmf?.(digit)
      } else callRef.current?.sendDigits(digit)
    } else {
      setPhoneNumber((value) => `${value}${digit}`)
    }
  }

  async function transferCall() {
    if (selectedProvider === 'telnyx') {
      if (!transferTarget.trim()) {
        setMessage('Enter a transfer destination.')
        return
      }
      const call = telnyxCallRef.current
      if (typeof call?.transfer === 'function') {
        await call.transfer(transferTarget.trim())
        setMessage('Transfer requested.')
      } else {
        setMessage('Telnyx transfer is not available in this SDK session.')
      }
      return
    }

    const callSid = callRef.current?.parameters.CallSid

    if (!callSid || !transferTarget.trim()) {
      setMessage('Enter a transfer destination.')
      return
    }

    const response = await fetch('/api/telephony/calls/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: callSid,
        target: transferTarget.trim(),
      }),
    })

    const result = (await response.json()) as {
      error?: string
    }

    setMessage(
      response.ok ? 'Transfer requested.' : result.error ?? 'Transfer failed.',
    )
  }

  async function saveClientUpdate(openContactAfterSave = false) {
    if (!initialContact) {
      setSaveState('error')
      setSaveMessage(
        'Open the dialer from a CRM contact before saving an update.',
      )
      return
    }

    setSaveState('saving')
    setSaveMessage('')

    try {
      const followUpIso =
        createFollowUpTask && followUpAt
          ? new Date(followUpAt).toISOString()
          : undefined

      await saveDialerContactUpdate({
        contactId: initialContact.id,
        outcome: callOutcome,
        leadStatus,
        notes: callNotes,
        followUpAt: followUpIso,
        createFollowUpTask,
      })

      setSaveState('success')
      setSaveMessage(
        createFollowUpTask
          ? 'Contact, timeline, and follow-up task saved.'
          : 'Contact and timeline saved.',
      )
      setCallNotes('')

      if (openContactAfterSave) {
        window.location.assign(`/dashboard/contacts/${initialContact.id}`)
      }
    } catch (error) {
      setSaveState('error')
      setSaveMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save the client update.',
      )
    }
  }

  const active = ['connecting', 'ringing', 'connected', 'incoming'].includes(
    callState,
  )

  return (
    <div className="space-y-6">
      <audio id="flowtix-telnyx-remote-audio" autoPlay className="hidden" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Cloud Dialer
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Browser softphone
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Subscriber-owned Twilio and Telnyx WebRTC calling with inbound registration, DTMF, mute, hold and transfer.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
            <UserRoundCheck className="h-4 w-4 text-cyan-300" />
            <select
              value={availability}
              onChange={(event) => void changeAvailability(event.target.value as AgentAvailability)}
              className="bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="available" className="bg-slate-950">Available</option>
              <option value="away" className="bg-slate-950">Away</option>
              <option value="dnd" className="bg-slate-950">Do not disturb</option>
              <option value="offline" className="bg-slate-950">Offline</option>
            </select>
            <span className="text-xs text-slate-400">{presence?.onlineDeviceCount ?? 0} device(s)</span>
          </label>
          <button
            type="button"
            onClick={() => void connectDevice()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Reconnect
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  deviceState === 'ready'
                    ? 'bg-emerald-400'
                    : deviceState === 'error'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                }`}
              />
              <div>
                <p className="font-semibold text-white">
                  {deviceState === 'ready'
                    ? 'Softphone online'
                    : 'Softphone not ready'}
                </p>
                <p className="text-xs text-slate-400">{message}</p>
              </div>
            </div>
            <Radio className="h-5 w-5 text-cyan-300" />
          </div>

          {callerIds.length > 0 ? (
            <label className="mt-6 block text-sm text-slate-300">
              Outbound caller ID
              <select
                value={selectedCallerId}
                onChange={(event) => setSelectedCallerId(event.target.value)}
                disabled={active}
                className={`${fieldClass} mt-2`}
              >
                {callerIds.map((number) => (
                  <option
                    key={number.id}
                    value={number.phoneNumber}
                    className="bg-white text-slate-950"
                  >
                    {number.friendlyName} · {number.phoneNumber} · {number.provider === 'telnyx' ? 'Telnyx' : 'Twilio'}
                    {number.isDefault ? ' · Default' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
              No supported voice number is available. Connect Twilio or Telnyx and import a phone number in Settings → Integrations before placing calls.
            </div>
          )}

          {callState === 'incoming' ? (
            <div className="mt-8 rounded-3xl border border-cyan-400/30 bg-cyan-400/10 p-8 text-center">
              <p className="text-sm uppercase tracking-[0.25em] text-cyan-200">
                Incoming call
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">
                {incomingFrom}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={acceptIncoming}
                  className="rounded-2xl bg-emerald-500 px-6 py-3 font-semibold text-white"
                >
                  Accept
                </button>
                <button
                  onClick={rejectIncoming}
                  className="rounded-2xl bg-rose-500 px-6 py-3 font-semibold text-white"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Phone number
                </label>
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  disabled={active}
                  placeholder="+14155550123"
                  className="mt-3 w-full bg-transparent text-center text-3xl font-semibold tracking-wide text-white outline-none placeholder:text-slate-700"
                />
                {initialContact && (
                  <p className="mt-2 text-center text-sm text-slate-400">
                    {initialContact.name}
                  </p>
                )}
              </div>

              <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3">
                {keyRows.flat().map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => sendDigit(key)}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] py-4 text-xl font-semibold text-white hover:bg-white/10"
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="mt-7 flex justify-center">
                {!active ? (
                  <button
                    type="button"
                    onClick={() => void placeCall()}
                    disabled={deviceState !== 'ready' || !selectedCallerId}
                    className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-40"
                  >
                    <Phone className="h-7 w-7" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={hangUp}
                    className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                  >
                    <PhoneOff className="h-7 w-7" />
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Live controls
              </h2>
              <span className="font-mono text-2xl text-cyan-300">
                {formatTime(elapsed)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={toggleMute}
                disabled={callState !== 'connected'}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {isMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>

              <button
                type="button"
                onClick={toggleHold}
                disabled={callState !== 'connected'}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {isOnHold ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
                {isOnHold ? 'Resume' : 'Hold'}
              </button>

              <button
                type="button"
                onClick={() => setIsRecording((value) => !value)}
                disabled={active}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {isRecording ? (
                  <StopCircle className="h-4 w-4" />
                ) : (
                  <Radio className="h-4 w-4" />
                )}
                {isRecording ? 'Recording on' : 'Recording off'}
              </button>

              <button
                type="button"
                onClick={() => setPhoneNumber('')}
                disabled={active}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Client call update
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Save the outcome, update the lead, and schedule follow-up
                  without leaving the dialer.
                </p>
              </div>
              <CalendarClock className="mt-1 h-5 w-5 text-cyan-300" />
            </div>

            {initialContact ? (
              <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
                  Selected client
                </p>
                <p className="mt-1 font-semibold text-white">
                  {initialContact.name}
                </p>
                <p className="text-xs text-slate-400">
                  {initialContact.phoneNumber}
                  {initialContact.company
                    ? ` · ${initialContact.company}`
                    : ''}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-3 text-sm text-amber-100">
                Open this dialer from a contact profile to enable CRM updates.
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Call outcome
                <select
                  value={callOutcome}
                  onChange={(event) => setCallOutcome(event.target.value)}
                  disabled={!initialContact || saveState === 'saving'}
                  className={`${fieldClass} mt-2`}
                >
                  <option value="connected" className="bg-white text-slate-950">Connected</option>
                  <option value="no_answer" className="bg-white text-slate-950">No answer</option>
                  <option value="busy" className="bg-white text-slate-950">Busy</option>
                  <option value="voicemail" className="bg-white text-slate-950">Voicemail</option>
                  <option value="wrong_number" className="bg-white text-slate-950">Wrong number</option>
                  <option value="callback" className="bg-white text-slate-950">Call back</option>
                  <option value="sale_closed" className="bg-white text-slate-950">Sale closed</option>
                  <option value="not_interested" className="bg-white text-slate-950">Not interested</option>
                </select>
              </label>

              <label className="text-sm text-slate-300">
                Lead status
                <select
                  value={leadStatus}
                  onChange={(event) => setLeadStatus(event.target.value)}
                  disabled={!initialContact || saveState === 'saving'}
                  className={`${fieldClass} mt-2`}
                >
                  <option value="new" className="bg-white text-slate-950">New</option>
                  <option value="contacted" className="bg-white text-slate-950">Contacted</option>
                  <option value="qualified" className="bg-white text-slate-950">Qualified</option>
                  <option value="proposal_sent" className="bg-white text-slate-950">Proposal sent</option>
                  <option value="negotiation" className="bg-white text-slate-950">Negotiation</option>
                  <option value="won" className="bg-white text-slate-950">Won</option>
                  <option value="lost" className="bg-white text-slate-950">Lost</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-sm text-slate-300">
              Call notes
              <textarea
                value={callNotes}
                onChange={(event) => setCallNotes(event.target.value)}
                disabled={!initialContact || saveState === 'saving'}
                rows={4}
                maxLength={5000}
                placeholder="What happened during the call?"
                className={`${fieldClass} mt-2 resize-y py-3`}
              />
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <input
                type="checkbox"
                checked={createFollowUpTask}
                onChange={(event) =>
                  setCreateFollowUpTask(event.target.checked)
                }
                disabled={!initialContact || saveState === 'saving'}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
              />
              <span>
                <span className="block text-sm font-medium text-white">
                  Create follow-up task
                </span>
                <span className="block text-xs text-slate-400">
                  Add a task to the contact record and dashboard.
                </span>
              </span>
            </label>

            {createFollowUpTask && (
              <label className="mt-4 block text-sm text-slate-300">
                Follow-up date and time
                <input
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(event) => setFollowUpAt(event.target.value)}
                  disabled={!initialContact || saveState === 'saving'}
                  className={`${fieldClass} mt-2`}
                />
              </label>
            )}

            {saveMessage && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-3 text-sm ${
                  saveState === 'success'
                    ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200'
                    : 'border-rose-400/20 bg-rose-400/5 text-rose-200'
                }`}
              >
                {saveState === 'success' && (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{saveMessage}</span>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void saveClientUpdate(false)}
                disabled={!initialContact || saveState === 'saving'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveState === 'saving' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Save update
              </button>

              <button
                type="button"
                onClick={() => void saveClientUpdate(true)}
                disabled={!initialContact || saveState === 'saving'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ExternalLink className="h-4 w-4" />
                Save & open contact
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
            <h2 className="text-lg font-semibold text-white">Cold transfer</h2>
            <p className="mt-1 text-sm text-slate-400">
              Transfer to an E.164 number or Twilio client identity.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={transferTarget}
                onChange={(event) => setTransferTarget(event.target.value)}
                placeholder="+14155550123"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={() => void transferCall()}
                disabled={callState !== 'connected'}
                className="rounded-2xl bg-cyan-500 px-4 py-3 text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
