'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  Phone,
  PhoneCall,
  PhoneOff,
  Save,
  Search,
  Settings2,
  ShieldCheck,
} from 'lucide-react'

import { getAssignedDialerContacts, type DialerContact } from './actions'

type ManagedDialerClientProps = {
  initialContact?: DialerContact | null
  initialPhoneNumber?: string
  assignedContacts?: DialerContact[]
}

type CallState = 'idle' | 'starting' | 'ringing' | 'connected' | 'completed' | 'failed' | 'cancelled'

type CallSnapshot = {
  id: string
  status: CallState | string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  provider_call_sid: string | null
  provider_status_raw: string | null
  recording_available: boolean
}

const fieldClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-cyan-400/50'

function cleanPhone(value: string): string {
  return value.trim().replace(/[\s().-]/g, '')
}

export default function ManagedDialerClient({
  initialContact = null,
  initialPhoneNumber = '',
  assignedContacts = [],
}: ManagedDialerClientProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialContact?.phoneNumber ?? initialPhoneNumber)
  const [activeContact, setActiveContact] = useState<DialerContact | null>(initialContact)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<DialerContact[]>(assignedContacts)
  const [contactSearchState, setContactSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [callbackNumber, setCallbackNumber] = useState('')
  const [savedCallbackNumber, setSavedCallbackNumber] = useState('')
  const [settingsState, setSettingsState] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading')
  const [settingsMessage, setSettingsMessage] = useState('Loading managed calling settings…')
  const [recordCall, setRecordCall] = useState(true)
  const [callState, setCallState] = useState<CallState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [callMessage, setCallMessage] = useState('Ready for managed outbound calling.')
  const [callSnapshot, setCallSnapshot] = useState<CallSnapshot | null>(null)

  const active = ['starting', 'ringing', 'connected'].includes(callState)
  const callbackChanged = cleanPhone(callbackNumber) !== cleanPhone(savedCallbackNumber)
  const canCall = useMemo(
    () => !active && /^\+[1-9]\d{7,14}$/.test(cleanPhone(phoneNumber)) && /^\+[1-9]\d{7,14}$/.test(cleanPhone(savedCallbackNumber)),
    [active, phoneNumber, savedCallbackNumber],
  )

  useEffect(() => {
    void fetch('/api/telephony/mocean/settings', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { callbackNumber?: string; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load managed calling settings.')
        const value = payload.callbackNumber ?? ''
        setCallbackNumber(value)
        setSavedCallbackNumber(value)
        setSettingsState('idle')
        setSettingsMessage(value ? 'Agent callback number is ready.' : 'Add the phone number that should ring first when you place a call.')
      })
      .catch((error) => {
        setSettingsState('error')
        setSettingsMessage(error instanceof Error ? error.message : 'Unable to load managed calling settings.')
      })
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setContactSearchState('loading')
      void getAssignedDialerContacts(contactSearch)
        .then((contacts) => {
          setContactResults(contacts)
          setContactSearchState('idle')
        })
        .catch(() => setContactSearchState('error'))
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [contactSearch])

  useEffect(() => {
    if (!callId || !active) return
    let stopped = false
    const poll = async () => {
      try {
        const response = await fetch(`/api/telephony/mocean/call?callId=${encodeURIComponent(callId)}`, { cache: 'no-store' })
        const payload = await response.json() as { call?: CallSnapshot; error?: string }
        if (!response.ok || !payload.call) return
        if (stopped) return
        setCallSnapshot(payload.call)
        const status = payload.call.status as CallState
        if (['ringing','connected','completed','failed','cancelled'].includes(status)) setCallState(status)
        if (status === 'connected') setCallMessage('Connected. Continue the conversation on your agent phone.')
        if (status === 'completed') setCallMessage('Call completed.')
        if (status === 'failed') setCallMessage(payload.call.provider_status_raw || 'Call failed.')
        if (status === 'cancelled') setCallMessage('Call ended.')
      } catch {
        // A transient polling failure must not tear down an active provider call.
      }
    }
    void poll()
    const interval = window.setInterval(() => void poll(), 2500)
    return () => { stopped = true; window.clearInterval(interval) }
  }, [callId, active])

  async function saveCallbackNumber() {
    setSettingsState('saving')
    setSettingsMessage('Saving agent callback number…')
    try {
      const response = await fetch('/api/telephony/mocean/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackNumber }),
      })
      const payload = await response.json() as { callbackNumber?: string; error?: string }
      if (!response.ok || !payload.callbackNumber) throw new Error(payload.error || 'Unable to save callback number.')
      setCallbackNumber(payload.callbackNumber)
      setSavedCallbackNumber(payload.callbackNumber)
      setSettingsState('idle')
      setSettingsMessage('Agent callback number saved. Flowtix will ring this number first.')
    } catch (error) {
      setSettingsState('error')
      setSettingsMessage(error instanceof Error ? error.message : 'Unable to save callback number.')
    }
  }

  async function placeCall() {
    if (!canCall) return
    setCallState('starting')
    setCallId(null)
    setCallSnapshot(null)
    setCallMessage('Starting managed outbound call…')
    try {
      const response = await fetch('/api/telephony/mocean/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toNumber: cleanPhone(phoneNumber),
          contactId: activeContact?.id ?? null,
          recordCall,
        }),
      })
      const payload = await response.json() as { callId?: string; status?: CallState; message?: string; error?: string }
      if (!response.ok || !payload.callId) throw new Error(payload.error || 'Unable to start managed outbound call.')
      setCallId(payload.callId)
      setCallState(payload.status ?? 'ringing')
      setCallMessage(payload.message ?? 'Answer your agent phone to connect the customer.')
    } catch (error) {
      setCallState('failed')
      setCallMessage(error instanceof Error ? error.message : 'Unable to start managed outbound call.')
    }
  }

  async function hangUp() {
    if (!callId) return
    setCallMessage('Ending call…')
    try {
      const response = await fetch('/api/telephony/mocean/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      const payload = await response.json() as { status?: CallState; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to end call.')
      setCallState(payload.status ?? 'cancelled')
      setCallMessage('Call ended.')
    } catch (error) {
      setCallMessage(error instanceof Error ? error.message : 'Unable to end call.')
    }
  }

  function chooseContact(contact: DialerContact) {
    if (active) return
    setActiveContact(contact)
    setPhoneNumber(contact.phoneNumber)
  }

  function resetForNextCall() {
    if (active) return
    setCallState('idle')
    setCallId(null)
    setCallSnapshot(null)
    setCallMessage('Ready for managed outbound calling.')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Cloud Dialer</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Flowtix Managed Calling</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            No carrier account or provider API keys are required from the subscriber. Flowtix rings your saved agent phone, then connects the selected CRM contact through managed outbound calling.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          <ShieldCheck className="h-4 w-4" /> Managed provider ready
        </div>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-0.5 h-5 w-5 text-cyan-300" />
          <div className="flex-1">
            <h2 className="font-semibold text-white">Your agent callback number</h2>
            <p className="mt-1 text-sm text-slate-400">Set this once. When you click Call, this phone rings first. After you answer, Flowtix connects the customer.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={callbackNumber}
                onChange={(event) => setCallbackNumber(event.target.value)}
                disabled={active || settingsState === 'saving'}
                placeholder="+639171234567"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => void saveCallbackNumber()}
                disabled={active || settingsState === 'saving' || !callbackChanged}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {settingsState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save number
              </button>
            </div>
            <p className={`mt-2 text-xs ${settingsState === 'error' ? 'text-rose-300' : 'text-slate-500'}`}>{settingsMessage}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white">Managed outbound call</p>
              <p className="mt-1 text-xs text-slate-400">{callMessage}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${callState === 'connected' ? 'bg-emerald-400/10 text-emerald-300' : callState === 'failed' ? 'bg-rose-400/10 text-rose-300' : 'bg-cyan-400/10 text-cyan-200'}`}>{callState}</span>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Customer phone number</label>
            <input
              value={phoneNumber}
              onChange={(event) => {
                setPhoneNumber(event.target.value)
                if (activeContact && event.target.value !== activeContact.phoneNumber) setActiveContact(null)
              }}
              disabled={active}
              placeholder="+14155550123"
              className="mt-3 w-full bg-transparent text-center text-3xl font-semibold tracking-wide text-white outline-none placeholder:text-slate-700"
            />
            {activeContact && <p className="mt-2 text-center text-sm text-cyan-300">{activeContact.name}{activeContact.company ? ` · ${activeContact.company}` : ''}</p>}
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-300">
            <input type="checkbox" checked={recordCall} onChange={(event) => setRecordCall(event.target.checked)} disabled={active} className="h-4 w-4" />
            Record this call when permitted by applicable law and your organization policy
          </label>

          <div className="mt-7 flex justify-center gap-3">
            {!active ? (
              <button type="button" onClick={() => void placeCall()} disabled={!canCall} className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-40" title="Call">
                <Phone className="h-7 w-7" />
              </button>
            ) : (
              <button type="button" onClick={() => void hangUp()} className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/20" title="Hang up">
                <PhoneOff className="h-7 w-7" />
              </button>
            )}
          </div>

          {callSnapshot && !active && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Last managed call</div>
              <p className="mt-2">Status: <span className="capitalize">{callSnapshot.status}</span>{typeof callSnapshot.duration_seconds === 'number' ? ` · ${callSnapshot.duration_seconds}s` : ''}</p>
              {callSnapshot.recording_available && <p className="mt-1 text-emerald-300">Recording available in the call record.</p>}
              <button type="button" onClick={resetForNextCall} className="mt-3 text-xs font-semibold text-cyan-300 hover:text-cyan-200">Clear status for next call</button>
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-cyan-300" />
            <div>
              <p className="font-semibold text-white">My assigned contacts</p>
              <p className="text-xs text-slate-500">Choose a CRM contact to load their phone number.</p>
            </div>
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input type="search" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} disabled={active} placeholder="Search name or number" className="min-h-10 w-full rounded-xl border border-white/10 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600" />
          </label>
          <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {contactSearchState === 'loading' && <div className="flex items-center gap-2 p-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>}
            {contactSearchState === 'error' && <p className="p-3 text-sm text-rose-300">Unable to search contacts.</p>}
            {contactSearchState !== 'loading' && contactResults.map((contact) => (
              <button key={contact.id} type="button" onClick={() => chooseContact(contact)} disabled={active} className={`w-full rounded-2xl border p-3 text-left transition ${activeContact?.id === contact.id ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.05]'}`}>
                <p className="text-sm font-semibold text-white">{contact.name}</p>
                <p className="mt-1 text-xs text-slate-400">{contact.phoneNumber}{contact.company ? ` · ${contact.company}` : ''}</p>
              </button>
            ))}
            {contactSearchState === 'idle' && contactResults.length === 0 && <p className="p-3 text-sm text-slate-500">No assigned contacts with phone numbers found.</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}
