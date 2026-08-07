'use client'

import { useActionState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Square,
  Wrench,
} from 'lucide-react'

import {
  cancelPlatformBackgroundJob,
  recoverPlatformStaleBackgroundJob,
  retryPlatformBackgroundJob,
} from '@/app/platform/jobs/actions'
import type { JobStatus } from '@/lib/jobs/types'

const initialState = {
  status: 'idle' as const,
  message: '',
}

type ActionState = typeof initialState | {
  status: 'success' | 'error'
  message: string
}

function Result({ state }: { state: ActionState }) {
  if (!state.message) return null

  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        state.status === 'success'
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          : 'border-red-400/20 bg-red-400/10 text-red-200'
      }`}
    >
      <div className="flex gap-2">
        {state.status === 'success' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{state.message}</span>
      </div>
    </div>
  )
}

function ActionForm({
  jobId,
  title,
  description,
  buttonLabel,
  action,
  icon: Icon,
}: {
  jobId: string
  title: string
  description: string
  buttonLabel: string
  action: typeof retryPlatformBackgroundJob
  icon: typeof RotateCcw
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex gap-3">
        <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {description}
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <textarea
          name="reason"
          required
          minLength={10}
          rows={3}
          placeholder="Reason for this platform job action"
          className="w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Applying...' : buttonLabel}
        </button>
      </form>

      <div className="mt-3">
        <Result state={state} />
      </div>
    </section>
  )
}

export default function PlatformJobControls({
  jobId,
  status,
  stale,
}: {
  jobId: string
  status: JobStatus
  stale: boolean
}) {
  const retryable =
    status === 'failed' ||
    status === 'dead_letter' ||
    status === 'cancelled'

  const cancellable =
    status === 'queued' ||
    status === 'scheduled' ||
    status === 'retrying'

  if (!retryable && !cancellable && !stale) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm text-slate-400">
          No manual job actions are available for this state.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {retryable ? (
        <ActionForm
          jobId={jobId}
          title="Retry job"
          description="Requeue the existing job using the same payload, queue, job type, and durable event history. The attempt counter is reset."
          buttonLabel="Retry background job"
          action={retryPlatformBackgroundJob}
          icon={RotateCcw}
        />
      ) : null}

      {cancellable ? (
        <ActionForm
          jobId={jobId}
          title="Cancel pending job"
          description="Cancel work that has not been claimed by a worker. Processing jobs cannot be cancelled from this control."
          buttonLabel="Cancel background job"
          action={cancelPlatformBackgroundJob}
          icon={Square}
        />
      ) : null}

      {stale ? (
        <ActionForm
          jobId={jobId}
          title="Recover stale worker lease"
          description="Release the expired worker lock. The job returns to retrying unless its maximum attempts have already been exhausted, in which case it moves to dead letter."
          buttonLabel="Recover stale lease"
          action={recoverPlatformStaleBackgroundJob}
          icon={Wrench}
        />
      ) : null}
    </div>
  )
}
