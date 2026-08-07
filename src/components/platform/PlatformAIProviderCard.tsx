'use client'

import { useActionState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

import { verifyPlatformAIProvider } from '@/app/platform/ai/actions'
import type { PlatformAIProviderStatus } from '@/lib/platform/ai'

const initialPlatformAIActionState = {
  status: 'idle' as const,
  message: '',
}

export default function PlatformAIProviderCard({
  provider,
}: {
  provider: PlatformAIProviderStatus
}) {
  const [state, action, pending] = useActionState(
    verifyPlatformAIProvider,
    initialPlatformAIActionState,
  )

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">
            AI provider
          </p>
          <h2 className="mt-2 text-xl font-semibold capitalize text-white">
            {provider.provider.replaceAll('-', ' ')}
          </h2>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            provider.configured
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
              : 'border-slate-600 bg-slate-800 text-slate-400'
          }`}
        >
          {provider.configured ? 'Configured' : 'Not configured'}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Text model</dt>
          <dd className="mt-1 break-all text-slate-200">
            {provider.textModel ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Fallback priority</dt>
          <dd className="mt-1 text-slate-200">
            {provider.priority === null ? '—' : provider.priority + 1}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Endpoint</dt>
          <dd className="mt-1 break-all text-slate-200">
            {provider.endpointHost ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Transcription model</dt>
          <dd className="mt-1 break-all text-slate-200">
            {provider.transcriptionModel ?? '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {provider.capabilities.length > 0 ? (
          provider.capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded-full border border-blue-400/15 bg-blue-400/[0.06] px-2.5 py-1 text-xs text-blue-200"
            >
              {capability}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">No active capabilities</span>
        )}
      </div>

      <form action={action} className="mt-6">
        <input type="hidden" name="provider" value={provider.provider} />
        <button
          type="submit"
          disabled={!provider.configured || pending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
          {pending ? 'Verifying...' : 'Verify provider'}
        </button>
      </form>

      {state.message ? (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            state.status === 'success'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
              : 'border-red-400/20 bg-red-400/10 text-red-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {state.status === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{state.message}</span>
          </div>
        </div>
      ) : null}
    </article>
  )
}
