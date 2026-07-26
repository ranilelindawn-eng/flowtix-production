import InviteMemberForm from '@/components/team/InviteMemberForm'
import PendingInvitations from '@/components/team/PendingInvitations'
import TeamMemberList from '@/components/team/TeamMemberList'
import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import {
  getInvitations,
  getTeamMembers,
} from '@/lib/team'

export default async function TeamPage() {
  const organization = await requirePermission('team.view')

  const [members, invitations] = await Promise.all([
    getTeamMembers(),
    getInvitations(),
  ])

  const canInviteMembers = hasPermission(
    organization.role,
    'team.invite',
  )

  const canManageMembers =
    hasPermission(
      organization.role,
      'team.update_roles',
    ) &&
    hasPermission(
      organization.role,
      'team.remove_members',
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Organization
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Team Management
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            The workspace owner pays for the subscription. Invited admins, managers, supervisors, and agents join this workspace without purchasing a separate plan.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Your role
          </p>

          <p className="mt-1 text-sm font-semibold capitalize text-white">
            {organization.role}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Team members
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {members.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Pending invitations
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {invitations.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Administrators
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {
              members.filter(
                (member) =>
                  member.role === 'owner' ||
                  member.role === 'admin',
              ).length
            }
          </p>
        </div>
      </div>

      {canInviteMembers ? (
        <InviteMemberForm />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white">
            Invitation permissions
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Only organization owners and administrators can invite
            members.
          </p>
        </div>
      )}

      <TeamMemberList
        members={members}
        currentUserRole={organization.role}
        canManageTeam={canManageMembers}
      />

      <PendingInvitations
        invitations={invitations}
        canManageTeam={canInviteMembers}
      />
    </div>
  )
}