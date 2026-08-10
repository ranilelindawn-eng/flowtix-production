'use client'
import Image from 'next/image'
import { useFormStatus } from 'react-dom'

import {
  removeMember,
  updateMemberRole,
} from '@/app/dashboard/team/actions'
import type {
  TeamMember,
  TeamRole,
} from '@/lib/team'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
type TeamMemberListProps = {
  members: TeamMember[]
  currentUserRole: TeamRole
  canManageTeam: boolean
}

const editableRoles: TeamRole[] = [
  'admin',
  'manager',
  'agent',
]

function UpdateRoleButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Saving...' : 'Save'}
    </button>
  )
}

function RemoveMemberButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Removing...' : 'Remove'}
    </button>
  )
}

function getInitials(
  fullName: string | null,
  email: string | null
): string {
  if (fullName?.trim()) {
    const parts = fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
  }

  if (email?.trim()) {
    return email.charAt(0).toUpperCase()
  }

  return '?'
}

function formatDate(value: string, timeZone: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
  }).format(date)
}

function roleBadgeClass(role: TeamRole): string {
  switch (role) {
    case 'owner':
      return 'border-purple-500/20 bg-purple-500/10 text-purple-300'
    case 'admin':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300'
    case 'manager':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300'
    case 'agent':
      return 'border-slate-600 bg-slate-800 text-slate-300'
  }
}

export default function TeamMemberList({
  members,
  currentUserRole,
  canManageTeam,
}: TeamMemberListProps) {
  const timeZone = useOrganizationTimezone()
  const canEditAdmins = currentUserRole === 'owner'

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          Team Members
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Review organization members and manage their access.
        </p>
      </div>

      {members.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <h3 className="text-sm font-semibold text-white">
            No team members found
          </h3>

          <p className="mt-2 text-sm text-slate-400">
            Members will appear here after they join your
            organization.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {members.map((member) => {
            const fullName =
              member.profile?.full_name?.trim() || null
            const email =
              member.profile?.email?.trim() || null

            const isOwner = member.role === 'owner'
            const isAdmin = member.role === 'admin'

            const canEditMember =
              canManageTeam &&
              !isOwner &&
              (!isAdmin || canEditAdmins)

            return (
              <div
                key={member.id}
                className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="flex min-w-0 items-center gap-4">
                {member.profile?.avatar_url ? (
  <Image
    src={member.profile.avatar_url}
    alt={`${fullName || email || 'Team member'} avatar`}
    width={44}
    height={44}
    unoptimized
    className="h-11 w-11 shrink-0 rounded-full object-cover"
  />
) : (
  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-white">
    {getInitials(fullName, email)}
  </div>
)}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-white">
                        {fullName || 'Unnamed member'}
                      </h3>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${roleBadgeClass(
                          member.role
                        )}`}
                      >
                        {member.role}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-sm text-slate-400">
                      {email || member.user_id}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Joined {formatDate(member.created_at, timeZone)}
                    </p>
                  </div>
                </div>

                {canEditMember ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <form
                      action={updateMemberRole}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={member.id}
                      />

                      <label
                        htmlFor={`role-${member.id}`}
                        className="sr-only"
                      >
                        Update role for{' '}
                        {fullName || email || 'team member'}
                      </label>

                      <select
                        id={`role-${member.id}`}
                        name="role"
                        defaultValue={member.role}
                        className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        {editableRoles.map((role) => (
                          <option
                            key={role}
                            value={role}
                          >
                            {role.charAt(0).toUpperCase() +
                              role.slice(1)}
                          </option>
                        ))}
                      </select>

                      <UpdateRoleButton />
                    </form>

                    <form action={removeMember}>
                      <input
                        type="hidden"
                        name="id"
                        value={member.id}
                      />

                      <RemoveMemberButton />
                    </form>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {isOwner
                      ? 'Ownership cannot be changed here.'
                      : canManageTeam
                        ? 'Only the owner can manage administrators.'
                        : 'You do not have permission to manage this member.'}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}