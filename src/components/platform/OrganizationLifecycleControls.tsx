'use client'

import { useActionState } from 'react'
import { AlertTriangle, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react'

import {
  updatePlatformOrganizationStatus,
} from '@/app/platform/organizations/actions'

const initialOrganizationLifecycleActionState = {
  status: 'idle' as const,
  message: '',
}

type Props = {
  organizationId: string
  organizationName: string
  status: string
}

export default function OrganizationLifecycleControls({
  organizationId,
  organizationName,
  status,
}: Props) {
  const [state, formAction, pending] = useActionState(
    updatePlatformOrganizationStatus,
    initialOrganizationLifecycleActionState,
  )

  const suspended = status === 'suspended'
  const archived = status === 'archived'
  const nextStatus = suspended ? 'active' : 'suspended'

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3">
        <div
          className={`rounded-xl p-2.5 ${
            suspended
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-amber-500/10 text-amber-300'
          }`}
        >
          {suspended ? (
            <PlayCircle className="h-5 w-5" />
          ) : (
            <PauseCircle className="h-5 w-5" />
          )}
        </div>
        <div>
          <h2 className="font-semibold text-white">Organization lifecycle</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {suspended
              ? 'Reactivate this workspace and restore members that were active when Flowtix suspended it.'
              : 'Suspend this workspace and immediately block its customer dashboard access.'}
          </p>
        </div>
      </div>

      {archived ? (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-400">
          Archived organizations are read-only in this phase. Archive restoration will require a dedicated lifecycle workflow.
        </div>
      ) : (
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="status" value={nextStatus} />

          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              Action reason
            </span>
            <textarea
              name="reason"
              required
              minLength={10}
              rows={4}
              placeholder={
                suspended
                  ? `Explain why ${organizationName} should be reactivated.`
                  : `Explain why ${organizationName} must be suspended.`
              }
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <div className="rounded-xl border border-white/10 bg-[#050D18] p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-xs leading-5 text-slate-400">
                Every lifecycle change is recorded with the Flowtix staff actor, reason,
                previous status, resulting status, and timestamp. Suspension does not
                cancel or rewrite the customer&apos;s PayMongo subscription.
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
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              suspended
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {pending
              ? 'Applying...'
              : suspended
                ? 'Reactivate organization'
                : 'Suspend organization'}
          </button>
        </form>
      )}
    </section>
  )
}
