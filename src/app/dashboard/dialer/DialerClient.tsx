'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Radio,
  RefreshCw,
  Search,
  UserRoundCheck,
} from 'lucide-react'

import {
  getAssignedDialerContacts,
  saveDialerContactUpdate,
  type DialerContact,
} from './actions'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
import { organizationLocalDateTimeToUtc, toOrganizationDateTimeLocal } from '@/lib/timezone'
type DialerPhoneNumber = {
  id: string
  phoneNumber: string
  friendlyName: string
  isDefault: boolean
  provider: 'signalwire'
}

type DialerClientProps = {
  organizationId: string
  initialContact?: DialerContact | null
  initialPhoneNumber?: string
  callerIds?: DialerPhoneNumber[]
  assignedContacts?: DialerContact[]
}

function providerDisplayName(): string {
  return 'Flowtix'
}

type TokenPayload = {
  provider: 'signalwire'
  token: string
  projectId?: string
  username?: string
  host?: string
  callerId?: string
  userId: string
  organizationId: string
  identity: string
  expiresIn: number
}


type SignalWireCallLike = {
  id?: string
  state?: string
  direction?: string
  remotePartyNumber?: string
  cause?: string
  causeCode?: number | string
  sipCode?: number | string
  sipReason?: string
  answer?: () => void | Promise<void>
  hangup?: () => void | Promise<void>
  hold?: () => void | Promise<void>
  unhold?: () => void | Promise<void>
  muteAudio?: () => void
  unmuteAudio?: () => void
  sendDigits?: (digits: string) => void
  dtmf?: (digits: string) => void
}

type SignalWireNotification = {
  type?: string
  call?: SignalWireCallLike
}

type SignalWireClientLike = {
  remoteElement?: string
  localElement?: string
  connected?: boolean
  connect: () => void | Promise<void>
  disconnect: () => void
  on: (event: string, handler: (payload?: unknown) => void) => SignalWireClientLike
  newCall: (options: {
    destinationNumber: string
    callerNumber: string
    audio: boolean
    video?: boolean
  }) => Promise<SignalWireCallLike>
}

type RelayConstructor = new (options: {
  project: string
  token: string
}) => SignalWireClientLike

function ensureUnmanagedAudioElement(id: string, muted = false): HTMLAudioElement {
  const existing = document.getElementById(id)
  if (existing instanceof HTMLAudioElement) {
    existing.autoplay = true
    existing.muted = muted
    return existing
  }

  const audio = document.createElement('audio')
  audio.id = id
  audio.autoplay = true
  audio.muted = muted
  audio.setAttribute('playsinline', '')
  audio.style.display = 'none'
  document.body.appendChild(audio)
  return audio
}

function removeUnmanagedAudioElement(id: string) {
  document.getElementById(id)?.remove()
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

function describeProviderError(payload?: unknown): string {
  if (payload instanceof Error) return payload.message
  if (typeof payload === 'string' && payload.trim()) return payload.trim()

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const nested =
      record.error && typeof record.error === 'object'
        ? (record.error as Record<string, unknown>)
        : null

    for (const candidate of [
      record.message,
      record.reason,
      record.errorMessage,
      nested?.message,
      nested?.reason,
    ]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }

    try {
      return JSON.stringify(payload)
    } catch {
      // Fall through.
    }
  }

  return 'Unknown provider error'
}

function getDefaultFollowUpDate(timeZone: string) {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setUTCMinutes(0, 0, 0)
  return toOrganizationDateTimeLocal(date, timeZone)
}

export default function DialerClient({
  organizationId,
  initialContact = null,
  initialPhoneNumber = '',
  callerIds = [],
  assignedContacts = [],
}: DialerClientProps) {
  const timeZone = useOrganizationTimezone()
  const [phoneNumber, setPhoneNumber] = useState(
    initialContact?.phoneNumber ?? initialPhoneNumber,
  )
  const [activeContact, setActiveContact] =
    useState<DialerContact | null>(initialContact)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] =
    useState<DialerContact[]>(assignedContacts)
  const [contactSearchState, setContactSearchState] =
    useState<'idle' | 'loading' | 'error'>('idle')
  const [selectedCallerId] = useState(
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
  const [elapsed, setElapsed] = useState(0)
  const [callScript, setCallScript] = useState('')
  const [incomingFrom, setIncomingFrom] = useState('')
  const [tokenPayload, setTokenPayload] = useState<TokenPayload | null>(null)
  const tokenPayloadRef = useRef<TokenPayload | null>(null)
  const [availability, setAvailability] = useState<AgentAvailability>('available')
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null)
  const deviceKeyRef = useRef('')

  const [callOutcome, setCallOutcome] = useState('connected')
  const [leadStatus, setLeadStatus] = useState('contacted')
  const [callNotes, setCallNotes] = useState('')
  const [followUpAt, setFollowUpAt] = useState(() => getDefaultFollowUpDate(timeZone))
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const signalWireClientRef = useRef<SignalWireClientLike | null>(null)
  const signalWireCallRef = useRef<SignalWireCallLike | null>(null)
  const callConnectedRef = useRef(false)
  const connectedCallIdsRef = useRef(new Set<string>())
  const terminalCallIdsRef = useRef(new Set<string>())
  const outboundCallIdsRef = useRef(new Set<string>())
  const outboundCallPendingRef = useRef(false)
  const browserCallRegistrationPromisesRef = useRef(new Map<string, Promise<void>>())
  const browserCallStatusQueuesRef = useRef(new Map<string, Promise<void>>())

  // These refs keep call-registration data current without making the browser
  // softphone connection effect depend on the dialed phone number. Otherwise
  // every digit typed rebuilds registerBrowserCall -> connectDevice -> useEffect,
  // disconnecting an already-ready WebRTC session while the user is dialing.
  const phoneNumberRef = useRef(phoneNumber)
  const selectedCallerIdRef = useRef(selectedCallerId)
  const initialContactIdRef = useRef(activeContact?.id ?? null)

  useEffect(() => {
    tokenPayloadRef.current = tokenPayload
  }, [tokenPayload])

  useEffect(() => {
    phoneNumberRef.current = phoneNumber
  }, [phoneNumber])

  useEffect(() => {
    selectedCallerIdRef.current = selectedCallerId
  }, [selectedCallerId])

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = window.localStorage.getItem(`flowtix:dialer-script:${organizationId}`)
    } catch {
      // Browser storage can be unavailable in privacy-restricted sessions.
    }

    if (saved === null) return

    const timer = window.setTimeout(() => {
      setCallScript(saved ?? '')
    }, 0)

    return () => window.clearTimeout(timer)
  }, [organizationId])

  useEffect(() => {
    initialContactIdRef.current = activeContact?.id ?? null
  }, [activeContact?.id])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setContactSearchState('loading')
      void getAssignedDialerContacts(contactSearch)
        .then((contacts) => {
          setContactResults(contacts)
          setContactSearchState('idle')
        })
        .catch(() => {
          setContactSearchState('error')
        })
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [contactSearch])

  const selectedProvider =
    callerIds.find((number) => number.phoneNumber === selectedCallerId)?.provider ??
    callerIds[0]?.provider ??
    'signalwire'

  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      seconds % 60,
    ).padStart(2, '0')}`


  const registerBrowserCall = useCallback((input: {
    provider: 'signalwire'
    providerCallId: string
  }): Promise<void> => {
    const providerCallId = input.providerCallId.trim()
    if (!providerCallId) return Promise.resolve()

    const existingRegistration =
      browserCallRegistrationPromisesRef.current.get(providerCallId)
    if (existingRegistration) return existingRegistration

    const registration = (async () => {
      const fromNumber = selectedCallerIdRef.current
      const toNumber = phoneNumberRef.current.trim()
      if (!fromNumber || !/^\+[1-9]\d{7,14}$/.test(toNumber)) {
        throw new Error('Unable to register browser call because the dialed number is invalid.')
      }

      const response = await fetch('/api/telephony/browser-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: input.provider,
          providerCallId,
          fromNumber,
          toNumber,
          contactId: initialContactIdRef.current,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        throw new Error(result.error ?? 'Unable to register browser call.')
      }
    })()

    browserCallRegistrationPromisesRef.current.set(providerCallId, registration)

    void registration.catch(() => {
      if (
        browserCallRegistrationPromisesRef.current.get(providerCallId) ===
        registration
      ) {
        browserCallRegistrationPromisesRef.current.delete(providerCallId)
      }
    })

    return registration
  }, [])

  const syncBrowserCallStatus = useCallback((input: {
    provider: 'signalwire'
    providerCallId: string | null | undefined
    direction?: string
    status: 'initiating' | 'ringing' | 'connected' | 'on-hold' | 'completed' | 'failed' | 'cancelled'
    rawStatus?: string
  }): Promise<void> => {
    const providerCallId = input.providerCallId?.trim()
    if (!providerCallId) return Promise.resolve()

    const previous =
      browserCallStatusQueuesRef.current.get(providerCallId) ?? Promise.resolve()

    const task = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          // SignalWire can emit callUpdate notifications before newCall() resolves.
          // Ensure the durable calls row exists before any outbound lifecycle status
          // is persisted, then serialize updates in notification order for this call.
          if (input.direction === 'outbound') {
            await registerBrowserCall({
              provider: input.provider,
              providerCallId,
            })
          }

          const response = await fetch('/api/telephony/browser-call/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: input.provider,
              providerCallId,
              status: input.status,
              rawStatus: input.rawStatus ?? input.status,
            }),
          })
          if (!response.ok) {
            const result = await response.json() as { error?: string }
            console.error(
              '[Flowtix telephony] browser call state sync failed',
              result.error,
            )
          }
        } catch (error) {
          console.error('[Flowtix telephony] browser call state sync failed', error)
        }
      })

    browserCallStatusQueuesRef.current.set(providerCallId, task)
    void task.finally(() => {
      if (browserCallStatusQueuesRef.current.get(providerCallId) === task) {
        browserCallStatusQueuesRef.current.delete(providerCallId)
      }
    })

    return task
  }, [registerBrowserCall])

  const handleSignalWireNotification = useCallback((payload?: unknown) => {
    const notification = payload as SignalWireNotification | undefined
    if (notification?.type !== 'callUpdate' || !notification.call) return

    const call = notification.call as SignalWireCallLike
    signalWireCallRef.current = call
    const state = String(call.state ?? '')
    const providerCallId = call.id?.trim() || null
    const isOutbound =
      call.direction === 'outbound' ||
      (call.direction !== 'inbound' && outboundCallPendingRef.current) ||
      (providerCallId ? outboundCallIdsRef.current.has(providerCallId) : false)
    if (isOutbound && providerCallId) outboundCallIdsRef.current.add(providerCallId)
    const lifecycleDirection = isOutbound ? 'outbound' : call.direction

    if (['new', 'trying', 'requesting'].includes(state)) {
      setCallState('connecting')
      setMessage(`Call ${state}…`)
      void syncBrowserCallStatus({
        provider: 'signalwire',
        providerCallId,
        direction: lifecycleDirection,
        status: 'initiating',
        rawStatus: state,
      })
    } else if (state === 'ringing') {
      const inbound = call.direction === 'inbound'
      setCallState(inbound ? 'incoming' : 'ringing')
      setIncomingFrom(call.remotePartyNumber ?? 'Unknown caller')
      setMessage(inbound ? 'Incoming Flowtix call' : 'Ringing…')
      void syncBrowserCallStatus({
        provider: 'signalwire',
        providerCallId,
        direction: lifecycleDirection,
        status: 'ringing',
        rawStatus: state,
      })
    } else if (state === 'active') {
      callConnectedRef.current = true
      if (providerCallId) connectedCallIdsRef.current.add(providerCallId)
      setCallState('connected')
      setMessage('Call connected')
      setElapsed(0)
      setIsOnHold(false)
      void syncBrowserCallStatus({
        provider: 'signalwire',
        providerCallId,
        direction: lifecycleDirection,
        status: 'connected',
        rawStatus: state,
      })
      if (call.direction === 'inbound') {
        void fetch('/api/telephony/inbound/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'signalwire',
            providerCallId: call.id ?? null,
            fromNumber: call.remotePartyNumber ?? null,
          }),
        })
      }
    } else if (state === 'held') {
      setCallState('connected')
      setIsOnHold(true)
      setMessage('Call on hold')
      void syncBrowserCallStatus({
        provider: 'signalwire',
        providerCallId,
        direction: lifecycleDirection,
        status: 'on-hold',
        rawStatus: state,
      })
    } else if (['hangup', 'destroyed', 'destroy', 'purge'].includes(state)) {
      // Relay can emit several terminal notifications for the same physical call.
      // Handle only the first one so a normal completed call cannot be followed by
      // a second terminal event that reclassifies it as failed.
      if (providerCallId && terminalCallIdsRef.current.has(providerCallId)) return
      if (providerCallId) terminalCallIdsRef.current.add(providerCallId)

      const reason =
        call.sipReason ||
        call.cause ||
        (call.sipCode ? `SIP ${call.sipCode}` : '') ||
        (call.causeCode ? `Cause ${call.causeCode}` : '') ||
        'Call ended'
      const wasConnected = providerCallId
        ? connectedCallIdsRef.current.has(providerCallId)
        : callConnectedRef.current
      const failed = !wasConnected

      console.info('[Flowtix Cloud Calling] call terminated', {
        id: call.id ?? null,
        state,
        direction: call.direction ?? null,
        remotePartyNumber: call.remotePartyNumber ?? null,
        sipCode: call.sipCode ?? null,
        sipReason: call.sipReason ?? null,
        cause: call.cause ?? null,
        causeCode: call.causeCode ?? null,
        wasConnected,
      })

      setCallState('ended')
      setMessage(`${reason} — complete the call outcome before moving on.`)
      setIsMuted(false)
      setIsOnHold(false)
      void syncBrowserCallStatus({
        provider: 'signalwire',
        providerCallId,
        direction: lifecycleDirection,
        status: failed ? 'failed' : 'completed',
        rawStatus: state,
      })
      signalWireCallRef.current = null
      callConnectedRef.current = false

      if (providerCallId) {
        window.setTimeout(() => {
          connectedCallIdsRef.current.delete(providerCallId)
          terminalCallIdsRef.current.delete(providerCallId)
          browserCallRegistrationPromisesRef.current.delete(providerCallId)
          browserCallStatusQueuesRef.current.delete(providerCallId)
          outboundCallIdsRef.current.delete(providerCallId)
        }, 60_000)
      }

      window.setTimeout(() => setCallState('idle'), 1200)
    }
  }, [syncBrowserCallStatus])

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
      providerIdentity: tokenPayloadRef.current?.identity ?? null,
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

  const fetchToken = useCallback(async (provider: DialerPhoneNumber['provider']): Promise<TokenPayload> => {
    if (!selectedCallerId) throw new Error('Select an owned voice number first.')
    const params = new URLSearchParams({ provider, callerId: selectedCallerId })
    const response = await fetch(`/api/telephony/token?${params.toString()}`, {
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
  }, [selectedCallerId])

  const connectDevice = useCallback(async () => {
    if (!selectedCallerId) {
      setDeviceState('offline')
      setMessage('Import and select an owned voice number before connecting the softphone.')
      return
    }

    setDeviceState('connecting')
    const providerLabel = providerDisplayName()
    setMessage(`Connecting ${providerLabel} browser softphone…`)

    try {
      signalWireClientRef.current?.disconnect?.()
      signalWireClientRef.current = null
      signalWireCallRef.current = null

      if (selectedProvider === 'signalwire') {
        const [signalWireModule, payload] = await Promise.all([
          import('@signalwire/js'),
          fetchToken('signalwire'),
        ])
        if (!payload.projectId) {
          throw new Error('SignalWire Project ID is unavailable.')
        }

        const Relay = (
          signalWireModule as unknown as { Relay?: RelayConstructor }
        ).Relay
        if (!Relay) {
          throw new Error('SignalWire Relay browser SDK did not initialize.')
        }

        let settled = false
        const markReady = () => {
          if (settled) return
          settled = true
          window.clearTimeout(connectTimeout)
          window.clearInterval(connectionPoll)
          setDeviceState('ready')
          setMessage('Flowtix softphone ready for outbound calls.')
        }
        const markFailed = (payload?: unknown) => {
          if (settled) return
          settled = true
          window.clearTimeout(connectTimeout)
          window.clearInterval(connectionPoll)
          const detail = describeProviderError(payload)
          console.error('[Flowtix Cloud Calling] connection failed', payload)
          setDeviceState('error')
          setMessage(`Flowtix softphone connection failed: ${detail}`)
        }
        const reportRuntimeError = (payload?: unknown) => {
          const detail = describeProviderError(payload)
          console.error('[Flowtix Cloud Calling] runtime error', payload)
          setMessage(`Flowtix call error: ${detail}`)
        }

        // Keep SignalWire media elements outside React's managed DOM. The Relay SDK
        // resolves these IDs to HTMLMediaElements internally; React-managed nodes carry
        // Fiber references that can become circular if an SDK transport serializes them.
        ensureUnmanagedAudioElement('flowtix-signalwire-remote-audio')
        ensureUnmanagedAudioElement('flowtix-signalwire-local-audio', true)

        const client = new Relay({
          project: payload.projectId,
          token: payload.token,
        })
        client.remoteElement = 'flowtix-signalwire-remote-audio'
        client.localElement = 'flowtix-signalwire-local-audio'

        const connectTimeout = window.setTimeout(() => {
          if (client.connected === true) {
            markReady()
            return
          }
          markFailed(
            'Timed out waiting for the Flowtix calling session. Please reconnect or contact support if the issue persists.',
          )
        }, 15000)

        const connectionPoll = window.setInterval(() => {
          if (client.connected === true) {
            markReady()
          }
        }, 500)

        client.on('signalwire.ready', markReady)
        client.on('signalwire.socket.open', () => {
          if (client.connected === true) markReady()
        })
        client.on('signalwire.socket.error', (event?: unknown) => {
          console.warn(
            '[Flowtix Cloud Calling] websocket transport error event',
            event,
          )
        })
        client.on('signalwire.error', (event?: unknown) => {
          if (!settled) {
            markFailed(event)
            return
          }
          reportRuntimeError(event)
        })
        client.on('signalwire.socket.close', (event?: unknown) => {
          if (!settled) {
            console.warn(
              '[Flowtix Cloud Calling] socket closed before ready',
              event,
            )
            return
          }
          setDeviceState('offline')
        })
        client.on('signalwire.notification', handleSignalWireNotification)

        signalWireClientRef.current = client
        setTokenPayload(payload)

        try {
          await Promise.resolve(client.connect())
          if (client.connected === true) {
            markReady()
          }
        } catch (error) {
          markFailed(error)
        }
        return
      }

      throw new Error('Flowtix Cloud Calling is the supported telephony service.')
    } catch (error) {
      setDeviceState('error')
      setMessage(error instanceof Error ? error.message : 'Unable to connect the softphone.')
    }
  }, [
    fetchToken,
    handleSignalWireNotification,
    selectedCallerId,
    selectedProvider,
  ])

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
      signalWireClientRef.current?.disconnect?.()
      removeUnmanagedAudioElement('flowtix-signalwire-remote-audio')
      removeUnmanagedAudioElement('flowtix-signalwire-local-audio')
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
    if (callState !== 'connected' || isOnHold) return

    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    )

    return () => window.clearInterval(timer)
  }, [callState, isOnHold])

  async function placeCall() {
    if (deviceState !== 'ready') {
      setMessage('Wait for the browser softphone to be online before placing a call.')
      return
    }

    if (!selectedCallerId) {
      setMessage('No Flowtix caller ID is assigned to this workspace yet.')
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
      callConnectedRef.current = false
      outboundCallPendingRef.current = true
      const client = signalWireClientRef.current
      if (!client) throw new Error('Flowtix softphone is not connected.')

      const destinationNumber = phoneNumber.trim()
      console.info('[Flowtix Cloud Calling] placing outbound call', {
        destinationNumber,
        callerNumber: selectedCallerId,
      })

      const call = await client.newCall({
        destinationNumber,
        callerNumber: selectedCallerId,
        audio: true,
        video: false,
      })

      console.info('[Flowtix Cloud Calling] outbound call object created', {
        id: call.id ?? null,
        state: call.state ?? null,
        direction: call.direction ?? null,
        remotePartyNumber: call.remotePartyNumber ?? null,
      })

      signalWireCallRef.current = call
      if (call.id) {
        outboundCallIdsRef.current.add(call.id)
        void registerBrowserCall({
          provider: 'signalwire',
          providerCallId: call.id,
        }).catch((error) => {
          console.error('[Flowtix telephony] browser call registration failed', error)
        })
      }
      outboundCallPendingRef.current = false
      setCallState('connecting')
      setMessage('Connecting call…')
    } catch (error) {
      outboundCallPendingRef.current = false
      setMessage(
        error instanceof Error ? error.message : 'Unable to place the call.',
      )
    }
  }

  function acceptIncoming() {
    void signalWireCallRef.current?.answer?.()
  }

  function rejectIncoming() {
    void signalWireCallRef.current?.hangup?.()
    setCallState('idle')
  }

  function hangUp() {
    void signalWireCallRef.current?.hangup?.()
  }

  function toggleMute() {
    const next = !isMuted
    if (next) signalWireCallRef.current?.muteAudio?.()
    else signalWireCallRef.current?.unmuteAudio?.()
    setIsMuted(next)
  }

  function toggleHold() {
    const next = !isOnHold
    void (next
      ? signalWireCallRef.current?.hold?.()
      : signalWireCallRef.current?.unhold?.())
    setMessage(next ? 'Call on hold' : 'Call resumed')
    setIsOnHold(next)
  }

  function sendDigit(digit: string) {
    if (callState === 'connected') {
      if (typeof signalWireCallRef.current?.sendDigits === 'function') {
        signalWireCallRef.current.sendDigits(digit)
      } else {
        signalWireCallRef.current?.dtmf?.(digit)
      }
    } else {
      setPhoneNumber((value) => `${value}${digit}`)
    }
  }


  async function saveClientUpdate(openContactAfterSave = false) {
    if (!activeContact) {
      setSaveState('error')
      setSaveMessage(
        'Select an assigned CRM contact before saving an update.',
      )
      return
    }

    setSaveState('saving')
    setSaveMessage('')

    try {
      const followUpIso =
        createFollowUpTask && followUpAt
          ? organizationLocalDateTimeToUtc(followUpAt, timeZone) ?? undefined
          : undefined

      const savedContactId = activeContact.id

      await saveDialerContactUpdate({
        contactId: savedContactId,
        outcome: callOutcome,
        leadStatus,
        notes: callNotes,
        followUpAt: followUpIso,
        createFollowUpTask,
      })

      // A saved outcome means this assignment has been worked. Keep the CRM
      // contact itself intact, but remove it from the Dialer's pending
      // assigned-contact worklist immediately so the caller cannot
      // accidentally select and call the same assignment twice.
      setContactResults((contacts) =>
        contacts.filter((contact) => contact.id !== savedContactId),
      )

      setSaveState('success')
      setSaveMessage(
        createFollowUpTask
          ? 'Contact, timeline, and follow-up task saved. Removed from assigned contacts.'
          : 'Contact and timeline saved. Removed from assigned contacts.',
      )
      setCallNotes('')

      if (openContactAfterSave) {
        window.location.assign(`/dashboard/contacts/${savedContactId}`)
        return
      }

      setActiveContact(null)
      setPhoneNumber('')
      setContactSearch('')
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
    <div className="w-full space-y-6 lg:relative lg:left-1/2 lg:w-[min(1720px,calc(100vw-320px))] lg:-translate-x-1/2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Cloud Dialer
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Browser softphone
          </h1>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
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

          {callerIds.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
              Calling is not available for this workspace yet. Contact your workspace owner or Flowtix support.
            </div>
          ) : null}

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
            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Phone number
                  </label>
                  <input
                    value={phoneNumber}
                    onChange={(event) => {
                      setPhoneNumber(event.target.value)
                      if (
                        activeContact &&
                        event.target.value !== activeContact.phoneNumber
                      ) {
                        setActiveContact(null)
                      }
                    }}
                    disabled={active}
                    placeholder="+14155550123"
                    className="mt-3 w-full bg-transparent text-center text-3xl font-semibold tracking-wide text-white outline-none placeholder:text-slate-700"
                  />
                  {activeContact && (
                    <p className="mt-2 text-center text-sm text-cyan-300">
                      {activeContact.name}
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
              </div>

              <aside className="min-h-[460px] rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div>
                  <p className="text-sm font-semibold text-white">
                    My assigned contacts
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Select a CRM contact to load the number without leaving the dialer.
                  </p>
                </div>

                <label className="relative mt-4 block">
                  <span className="sr-only">Search assigned contacts</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={contactSearch}
                    onChange={(event) => setContactSearch(event.target.value)}
                    disabled={active}
                    placeholder="Search name or number"
                    className="min-h-10 w-full rounded-xl border border-white/10 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
                  />
                </label>

                <div className="mt-4 max-h-[500px] space-y-3 overflow-y-auto pr-1">
                  {contactSearchState === 'loading' ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading contacts…
                    </div>
                  ) : null}

                  {contactSearchState === 'error' ? (
                    <p className="px-2 py-3 text-xs text-rose-300">
                      Unable to load assigned contacts.
                    </p>
                  ) : null}

                  {contactSearchState !== 'loading' &&
                  contactResults.length === 0 ? (
                    <p className="px-2 py-3 text-xs leading-5 text-slate-500">
                      No assigned contacts with a phone number were found.
                    </p>
                  ) : null}

                  {contactResults.map((contact) => {
                    const selected = activeContact?.id === contact.id

                    return (
                      <button
                        key={contact.id}
                        type="button"
                        disabled={active}
                        onClick={() => {
                          setActiveContact(contact)
                          setPhoneNumber(contact.phoneNumber)
                          setSaveState('idle')
                          setSaveMessage('')
                        }}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:opacity-50 ${
                          selected
                            ? 'border-cyan-400/30 bg-cyan-400/10'
                            : 'border-white/10 bg-slate-950/40 hover:bg-white/[0.06]'
                        }`}
                      >
                        <p className="truncate text-base font-semibold text-white">
                          {contact.name}
                        </p>
                        <p className="mt-1.5 truncate text-sm text-slate-400">
                          {contact.phoneNumber}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </aside>
            </div>
          )}
        </section>


        <aside className="flex min-h-[720px] flex-col rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/10">
              <FileText className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Call script notepad</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Keep your call script, discovery questions, rebuttals, and talking points visible while you dial.
              </p>
            </div>
          </div>

          <textarea
            value={callScript}
            onChange={(event) => {
              const value = event.target.value
              setCallScript(value)
              try {
                window.localStorage.setItem(`flowtix:dialer-script:${organizationId}`, value)
              } catch {
                // Keep the notepad usable even when browser storage is unavailable.
              }
            }}
            placeholder={`Example:

Opening:
Hi {{first_name}}, this is ...

Discovery questions:
• What are you using today?
• What is the biggest challenge?

Key points / objection handling:`}
            className="mt-5 min-h-[590px] flex-1 resize-y rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] leading-7 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
          />

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Saved in this browser for the current Flowtix workspace. This script is not written to the contact record.
          </p>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Live controls</h2>
              <p className="mt-1 text-sm text-slate-400">
                Calls are recorded automatically after they connect.
              </p>
            </div>
            <span className="font-mono text-2xl text-cyan-300">
              {formatTime(elapsed)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={toggleMute}
              disabled={callState !== 'connected'}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button
              type="button"
              onClick={toggleHold}
              disabled={callState !== 'connected'}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {isOnHold ? 'Resume' : 'Hold'}
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
              <Radio className="h-4 w-4" />
              Automatic recording enabled
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Flowtix requests provider recording when the call reaches the connected state.
            </p>
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

            {activeContact ? (
              <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
                  Selected client
                </p>
                <p className="mt-1 font-semibold text-white">
                  {activeContact.name}
                </p>
                <p className="text-xs text-slate-400">
                  {activeContact.phoneNumber}
                  {activeContact.company
                    ? ` · ${activeContact.company}`
                    : ''}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-3 text-sm text-amber-100">
                Select one of your assigned contacts to enable CRM updates.
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Call outcome
                <select
                  value={callOutcome}
                  onChange={(event) => setCallOutcome(event.target.value)}
                  disabled={!activeContact || saveState === 'saving'}
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
                  disabled={!activeContact || saveState === 'saving'}
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
                disabled={!activeContact || saveState === 'saving'}
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
                disabled={!activeContact || saveState === 'saving'}
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
                  disabled={!activeContact || saveState === 'saving'}
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
                disabled={!activeContact || saveState === 'saving'}
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
                disabled={!activeContact || saveState === 'saving'}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ExternalLink className="h-4 w-4" />
                Save & open contact
              </button>
            </div>
          </section>

      </div>
    </div>
  )
}
