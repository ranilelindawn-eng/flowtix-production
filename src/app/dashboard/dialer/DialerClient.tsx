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
} from 'lucide-react'

import {
  saveDialerContactUpdate,
  type DialerContact,
} from './actions'

type DialerClientProps = {
  initialContact?: DialerContact | null
  initialPhoneNumber?: string
}

type TokenPayload = {
  token: string
  userId: string
  organizationId: string
  identity: string
  expiresIn: number
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

const keyRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

const fieldClass =
  'min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-cyan-400/50'

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
}: DialerClientProps) {
  const [phoneNumber, setPhoneNumber] = useState(
    initialContact?.phoneNumber ?? initialPhoneNumber,
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

  const [callOutcome, setCallOutcome] = useState('connected')
  const [leadStatus, setLeadStatus] = useState('contacted')
  const [callNotes, setCallNotes] = useState('')
  const [followUpAt, setFollowUpAt] = useState(getDefaultFollowUpDate)
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  const deviceRef = useRef<Device | null>(null)
  const callRef = useRef<Call | null>(null)

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

  const fetchToken = useCallback(async (): Promise<TokenPayload> => {
    const response = await fetch('/api/telephony/token', {
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
    setMessage('Connecting browser softphone…')

    try {
      const [{ Device: TwilioDevice }, payload] = await Promise.all([
        import('@twilio/voice-sdk'),
        fetchToken(),
      ])

      await deviceRef.current?.destroy()

      const device = new TwilioDevice(payload.token, {
        closeProtection: true,
        enableImprovedSignalingErrorPrecision: true,
        tokenRefreshMs: 30000,
      })

      device.on('registered', () => {
        setDeviceState('ready')
        setMessage('Softphone ready for inbound and outbound calls.')
      })
      device.on('unregistered', () => setDeviceState('offline'))
      device.on('error', (error: Error) => {
        setDeviceState('error')
        setMessage(error.message)
      })
      device.on('incoming', (call: Call) => {
        setIncomingFrom(call.parameters.From ?? 'Unknown caller')
        attachCallEvents(call, true)
      })
      device.on('tokenWillExpire', async () => {
        try {
          device.updateToken((await fetchToken()).token)
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
  }, [attachCallEvents, fetchToken])

  useEffect(() => {
    void connectDevice()

    return () => {
      void deviceRef.current?.destroy()
    }
  }, [connectDevice])

  useEffect(() => {
    if (callState !== 'connected' || isOnHold) return

    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    )

    return () => window.clearInterval(timer)
  }, [callState, isOnHold])

  async function placeCall() {
    if (
      !deviceRef.current ||
      !tokenPayload ||
      !/^\+[1-9]\d{7,14}$/.test(phoneNumber.trim())
    ) {
      setMessage('Enter a valid E.164 number, for example +14155550123.')
      return
    }

    try {
      const call = await deviceRef.current.connect({
        params: {
          To: phoneNumber.trim(),
          CallFlowUserId: tokenPayload.userId,
          CallFlowOrganizationId: tokenPayload.organizationId,
          ContactId: initialContact?.id ?? '',
          Record: String(isRecording),
        },
      })

      attachCallEvents(call)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to place the call.',
      )
    }
  }

  function acceptIncoming() {
    callRef.current?.accept()
  }

  function rejectIncoming() {
    callRef.current?.reject()
    setCallState('idle')
  }

  function hangUp() {
    callRef.current?.disconnect()
  }

  function toggleMute() {
    const next = !isMuted
    callRef.current?.mute(next)
    setIsMuted(next)
  }

  function toggleHold() {
    const next = !isOnHold
    callRef.current?.mute(next)
    setIsOnHold(next)
    setMessage(next ? 'Call on hold (local audio muted)' : 'Call resumed')
  }

  function sendDigit(digit: string) {
    if (callState === 'connected') {
      callRef.current?.sendDigits(digit)
    } else {
      setPhoneNumber((value) => `${value}${digit}`)
    }
  }

  async function transferCall() {
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Cloud Dialer
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Browser softphone
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Twilio WebRTC calling with inbound registration, DTMF, mute, hold,
            transfer and recording.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void connectDevice()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" />
          Reconnect
        </button>
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
                    disabled={deviceState !== 'ready'}
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
                  <option value="connected">Connected</option>
                  <option value="no_answer">No answer</option>
                  <option value="busy">Busy</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="wrong_number">Wrong number</option>
                  <option value="callback">Call back</option>
                  <option value="sale_closed">Sale closed</option>
                  <option value="not_interested">Not interested</option>
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
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal_sent">Proposal sent</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
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