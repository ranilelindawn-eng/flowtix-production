'use client'

import { useActionState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
} from 'lucide-react'

import {
  replayPlatformPayMongoEvent,
} from '@/app/platform/billing/actions'

const initialPlatformBillingActionState = {
  status: 'idle' as const,
  message: '',
}

export default function PlatformBillingReplayControls({
  eventId,
  status,
}: {
  eventId: string
  status: string
}) {
  const [state, formAction, pending] = useActionState(
    replayPlatformPayMongoEvent,
    initialPlatformBillingActionState,
  )

  const replayable = status === 'failed' || status === 'ignored'

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
          <RefreshCcw className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-white">PayMongo webhook replay</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Replay a failed or intentionally ignored stored event through the
            existing hardened PayMongo lifecycle processor.
          </p>
        </div>
      </div>

      {!replayable ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-[#050D18] p-4 text-sm text-slate-500">
          Only failed or ignored events can be replayed. Processed events remain
          immutable to preserve idempotency.
        </div>
      ) : (
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="eventId" value={eventId} />

          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              Replay reason
            </span>
            <textarea
              name="reason"
              required
              minLength={10}
              rows={4}
              placeholder="Document why this PayMongo event should be replayed."
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-xs leading-5 text-slate-400">
                Replay does not mark a payment as paid. It reruns the stored
                provider payload through the same PayMongo validation,
                idempotency, amount, currency, tenant, and lifecycle checks used
                by the production webhook.
              </p>
            </div>
          </div>

          {state.message ? (
            <div
              className={`rounded-xl border p-4 text-sm ${
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

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Replaying...' : 'Replay PayMongo event'}
          </button>
        </form>
      )}
    </section>
  )
}
