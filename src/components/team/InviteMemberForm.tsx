'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import {
  inviteTeamMember,
  type TeamActionState,
} from '@/app/dashboard/team/actions'
import type { TeamRole } from '@/lib/team'

const initialTeamActionState: TeamActionState = {
  status: 'idle',
  message: '',
}

const roles: TeamRole[] = [
  'admin',
  'manager',
  'agent',
]

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Sending Invitation...' : 'Invite Member'}
    </button>
  )
}

export default function InviteMemberForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(
    inviteTeamMember,
    initialTeamActionState,
  )

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          Invite Team Member
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Invite a new user to join your organization.
        </p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="space-y-6 p-6"
      >
        {state.status !== 'idle' && state.message ? (
          <div
            role={state.status === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={
              state.status === 'error'
                ? 'rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200'
                : 'rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-200'
            }
          >
            <p className="font-semibold">
              {state.status === 'error'
                ? 'Invitation could not be sent'
                : 'Invitation created'}
            </p>
            <p className="mt-1">{state.message}</p>
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Email Address
            </label>

            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="john@example.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="mb-2 block text-sm font-medium text-slate-200"
            >
              Role
            </label>

            <select
              id="role"
              name="role"
              defaultValue="agent"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h3 className="text-sm font-semibold text-white">
            Role Permissions
          </h3>

          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>
              <strong className="text-slate-200">Admin:</strong>{' '}
              Full access except ownership.
            </li>
            <li>
              <strong className="text-slate-200">Manager:</strong>{' '}
              Manage calls, campaigns, reports, and agents.
            </li>
            <li>
              <strong className="text-slate-200">Agent:</strong>{' '}
              Make calls and access assigned work only.
            </li>
          </ul>
        </div>

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </section>
  )
}
