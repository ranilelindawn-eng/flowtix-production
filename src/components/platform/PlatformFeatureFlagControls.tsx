'use client'

import { useActionState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Trash2,
} from 'lucide-react'

import {
  removeOrganizationFeatureFlagOverride,
  setOrganizationFeatureFlagOverride,
  updatePlatformFeatureFlag,
} from '@/app/platform/feature-flags/actions'
import type {
  PlatformFeatureFlag,
  PlatformFeatureFlagOverride,
} from '@/lib/platform/feature-flags'

const initialState = {
  status: 'idle' as const,
  message: '',
}

type OrganizationOption = {
  id: string
  name: string
  status: string
}

function Result({
  state,
}: {
  state: {
    status: 'idle' | 'success' | 'error'
    message: string
  }
}) {
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

export function PlatformGlobalFlagControls({
  flag,
}: {
  flag: PlatformFeatureFlag
}) {
  const [state, formAction, pending] = useActionState(
    updatePlatformFeatureFlag,
    initialState,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
          <Flag className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Global rollout</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Controls the default operational state when an organization does not
            have its own override.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="flagKey" value={flag.flagKey} />

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Default state
          </span>
          <select
            name="defaultEnabled"
            defaultValue={flag.defaultEnabled ? 'true' : 'false'}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Rollout percentage
          </span>
          <input
            type="number"
            name="rolloutPercentage"
            min={0}
            max={100}
            required
            defaultValue={flag.rolloutPercentage}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Action reason
          </span>
          <textarea
            name="reason"
            required
            minLength={10}
            rows={3}
            placeholder="Why is this global rollout changing?"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Update global rollout'}
        </button>
      </form>

      <div className="mt-4">
        <Result state={state} />
      </div>
    </section>
  )
}

export function PlatformFlagOverrideControls({
  flag,
  organizations,
}: {
  flag: PlatformFeatureFlag
  organizations: OrganizationOption[]
}) {
  const [state, formAction, pending] = useActionState(
    setOrganizationFeatureFlagOverride,
    initialState,
  )

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="font-semibold text-white">Add / replace organization override</h2>
      <p className="mt-1 text-sm leading-6 text-slate-400">
        An organization override supersedes the global enabled state. Leave the
        override rollout blank to inherit the global rollout percentage.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="flagKey" value={flag.flagKey} />

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Organization</span>
          <select
            name="organizationId"
            required
            defaultValue=""
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="" disabled>Select organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} ({organization.status})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Override state
          </span>
          <select
            name="enabled"
            defaultValue="true"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Override rollout (optional)
          </span>
          <input
            type="number"
            name="rolloutPercentage"
            min={0}
            max={100}
            placeholder="Inherit global rollout"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Action reason
          </span>
          <textarea
            name="reason"
            required
            minLength={10}
            rows={3}
            placeholder="Why does this organization need an override?"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
          />
        </label>

        <button
          type="submit"
          disabled={pending || organizations.length === 0}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save organization override'}
        </button>
      </form>

      <div className="mt-4">
        <Result state={state} />
      </div>
    </section>
  )
}

export function PlatformRemoveFlagOverride({
  flagKey,
  override,
}: {
  flagKey: string
  override: PlatformFeatureFlagOverride
}) {
  const [state, formAction, pending] = useActionState(
    removeOrganizationFeatureFlagOverride,
    initialState,
  )

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="flagKey" value={flagKey} />
      <input
        type="hidden"
        name="organizationId"
        value={override.organizationId}
      />
      <input
        name="reason"
        required
        minLength={10}
        placeholder="Reason for removal"
        className="h-9 w-full min-w-52 rounded-lg border border-white/10 bg-[#050D18] px-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-400/20 bg-red-400/10 px-3 text-xs font-semibold text-red-200 transition hover:bg-red-400/15 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? 'Removing...' : 'Remove override'}
      </button>
      <Result state={state} />
    </form>
  )
}
