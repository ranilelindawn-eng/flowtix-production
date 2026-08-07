'use client'

import { useActionState } from 'react'
import { AlertTriangle, Headphones, ShieldCheck } from 'lucide-react'

import { startPlatformSupportSession } from '@/app/platform/support/actions'

type OrganizationOption = {
  id: string
  name: string
  status: string
}

const initialPlatformSupportActionState = {
  status: 'idle' as const,
  message: '',
}

export default function PlatformSupportSessionForm({
  organizations,
  sessionMinutes,
  referenceRequired,
}: {
  organizations: OrganizationOption[]
  sessionMinutes: number
  referenceRequired: boolean
}) {
  const [state, formAction, pending] = useActionState(
    startPlatformSupportSession,
    initialPlatformSupportActionState,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
          <Headphones className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Start support workspace session</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Creates a temporary {sessionMinutes}-minute read-only support session. The staff
            account is not added to the customer organization.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-300">Organization</span>
          <select
            name="organizationId"
            required
            defaultValue=""
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="" disabled>Select customer organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} ({organization.status})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Support ticket / reference{referenceRequired ? ' *' : ''}
          </span>
          <input
            name="reference"
            required={referenceRequired}
            placeholder="Example: SUP-1842 or customer-requested troubleshooting"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Reason</span>
          <textarea
            name="reason"
            required
            minLength={15}
            rows={4}
            placeholder="Describe why temporary workspace access is required."
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
          />
        </label>

        <div className="rounded-xl border border-blue-400/15 bg-blue-400/[0.04] p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
            <p className="text-xs leading-5 text-slate-400">
              This phase provides read-only organization-scoped support access.
              Customer records cannot be edited, deleted, billed, called, or
              messaged from the support session. Start/end events are audit logged.
            </p>
          </div>
        </div>

        {state.message ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.message}</span>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending || organizations.length === 0}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Starting session...' : 'Start read-only support session'}
        </button>
      </form>
    </section>
  )
}
