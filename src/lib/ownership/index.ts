import { createClient } from '@/lib/supabase/server'
import type { CurrentOrganizationMembership, TeamRole } from '@/lib/team'

export type AssignmentScope = 'own' | 'team' | 'all'

export type AssignableMember = {
  membershipId: string
  userId: string
  role: TeamRole
  name: string
  email: string | null
}

export function getRoleAssignmentScope(role: TeamRole): AssignmentScope {
  if (role === 'owner' || role === 'admin' || role === 'manager') {
    return 'all'
  }

  return 'own'
}

export function canAssignOtherMembers(role: TeamRole): boolean {
  return getRoleAssignmentScope(role) !== 'own'
}

export async function getAssignableMembers(
  membership: CurrentOrganizationMembership,
): Promise<AssignableMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'get_current_organization_team_members',
  )

  if (error) {
    throw new Error(`Failed to load assignable members: ${error.message}`)
  }

  const rows = Array.isArray(data) ? data : []
  const members = rows.flatMap((row): AssignableMember[] => {
    if (!row || typeof row !== 'object') return []

    const value = row as Record<string, unknown>
    const membershipId = value.id
    const userId = value.user_id
    const role = value.role

    if (
      typeof membershipId !== 'string' ||
      typeof userId !== 'string' ||
      (role !== 'owner' &&
        role !== 'admin' &&
        role !== 'manager' &&
        role !== 'agent')
    ) {
      return []
    }

    const fullName =
      typeof value.full_name === 'string'
        ? value.full_name.trim()
        : ''
    const email =
      typeof value.email === 'string' ? value.email : null

    return [{
      membershipId,
      userId,
      role,
      name: fullName || email || 'Unnamed member',
      email,
    }]
  })

  if (canAssignOtherMembers(membership.role)) {
    return members
  }

  return members.filter(
    (member) => member.membershipId === membership.membership_id,
  )
}

export async function resolveOwnerAssignment(
  membership: CurrentOrganizationMembership,
  requestedMembershipId: string | null | undefined,
): Promise<{
  ownerMembershipId: string | null
  ownerUserId: string | null
}> {
  const normalized = requestedMembershipId?.trim() || null

  if (!normalized) {
    return {
      ownerMembershipId: membership.membership_id,
      ownerUserId: membership.user_id,
    }
  }

  if (
    !canAssignOtherMembers(membership.role) &&
    normalized !== membership.membership_id
  ) {
    throw new Error('You can only assign records to yourself.')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('id,user_id')
    .eq('id', normalized)
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to validate the assigned owner: ${error.message}`)
  }

  if (!data) {
    throw new Error('The assigned owner is not an active member of this organization.')
  }

  return {
    ownerMembershipId: data.id,
    ownerUserId: data.user_id,
  }
}
