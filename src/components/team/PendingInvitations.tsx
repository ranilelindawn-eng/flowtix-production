'use client'

import { useFormStatus } from 'react-dom'

import { revokeInvitation } from '@/app/dashboard/team/actions'
import type { TeamInvitation } from '@/lib/team'

type PendingInvitationsProps = {
  invitations: TeamInvitation[]
  canManageTeam: boolean
}

function RevokeButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Revoking...' : 'Revoke'}
    </button>
  )
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

function roleColor(role: string) {
  switch (role) {
    case 'admin':
      return 'bg-blue-500/10 border-blue-500/20 text-blue-300'
    case 'manager':
      return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
    case 'agent':
      return 'bg-slate-700 border-slate-600 text-slate-300'
    default:
      return 'bg-purple-500/10 border-purple-500/20 text-purple-300'
  }
}

export default function PendingInvitations({
  invitations,
  canManageTeam,
}: PendingInvitationsProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          Pending Invitations
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Invitations that have not yet been accepted.
        </p>
      </div>

      {invitations.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-slate-400">
            There are no pending invitations.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <div className="flex items-center gap-3">
                  <p className="font-medium text-white">
                    {invite.email}
                  </p>

                  <span
                    className={`rounded-full border px-2 py-1 text-xs capitalize ${roleColor(
                      invite.role
                    )}`}
                  >
                    {invite.role}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-400">
                  Invited on {formatDate(invite.created_at)}
                </p>

                <p className="text-xs text-slate-500">
                  Expires {formatDate(invite.expires_at)}
                </p>
              </div>

              {canManageTeam ? (
                <form action={revokeInvitation}>
                  <input
                    type="hidden"
                    name="id"
                    value={invite.id}
                  />

                  <RevokeButton />
                </form>
              ) : (
                <span className="text-xs text-slate-500">
                  Read only
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}