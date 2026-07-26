'use client'

import { useState } from 'react'
import { BrainCircuit, FileText } from 'lucide-react'

type Props = { recordingId: string; callId: string }

export default function CloudRecordingActions({ recordingId, callId }: Props) {
  const [busy, setBusy] = useState<'transcribe' | 'analyze' | null>(null)
  const [message, setMessage] = useState('')

  async function run(kind: 'transcribe' | 'analyze') {
    setBusy(kind)
    setMessage('')
    const response = await fetch(
      kind === 'transcribe' ? '/api/telephony/ai/transcribe' : '/api/telephony/ai/process',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'transcribe' ? { recordingId } : { callId }),
      },
    )
    const result = await response.json() as { error?: string }
    setMessage(response.ok ? (kind === 'transcribe' ? 'Transcript created.' : 'AI insights created.') : result.error ?? 'Request failed.')
    setBusy(null)
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void run('transcribe')} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><FileText className="h-3.5 w-3.5" />{busy === 'transcribe' ? 'Transcribing…' : 'Transcribe'}</button>
        <button type="button" onClick={() => void run('analyze')} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><BrainCircuit className="h-3.5 w-3.5" />{busy === 'analyze' ? 'Analyzing…' : 'AI analysis'}</button>
      </div>
      {message ? <p className="mt-2 text-xs text-slate-400">{message}</p> : null}
    </div>
  )
}
