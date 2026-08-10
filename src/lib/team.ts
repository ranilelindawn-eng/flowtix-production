import { cache } from 'react'

import { getCurrentPlatformMembership } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

export type TeamRole = 'owner' | 'admin' | 'manager' | 'agent'

export type TeamMember = {
  id: string
  organization_id: string
  user_id: string
  role: TeamRole
  created_at: string
  profile: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

export type TeamInvitation = {
  id: string
  organization_id: string
  email: string
  role: TeamRole
  token: string
  invited_by: string
  accepted_by: string | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type CurrentOrganizationMembership = {
  membership_id: string
  organization_id: string
  user_id: string
  role: TeamRole
}

type CurrentMembershipRpcRow = {
  membership_id: unknown
  organization_id: unknown
  user_id: unknown
  role: unknown
}

type TeamMemberRpcRow = {
  id: unknown
  organization_id: unknown
  user_id: unknown
  role: unknown
  created_at: unknown
  full_name: unknown
  email: unknown
  avatar_url: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTeamRole(value: unknown): value is TeamRole {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'manager' ||
    value === 'agent'
  )
}

function parseCurrentMembership(
  value: unknown,
): CurrentOrganizationMembership | null {
  if (!isRecord(value)) {
    return null
  }

  const row: CurrentMembershipRpcRow = {
    membership_id: value.membership_id ?? value.id,
    organization_id: value.organization_id,
    user_id: value.user_id,
    role: value.role,
  }

  if (
    typeof row.membership_id !== 'string' ||
    row.membership_id.length === 0 ||
    typeof row.organization_id !== 'string' ||
    row.organization_id.length === 0 ||
    typeof row.user_id !== 'string' ||
    row.user_id.length === 0 ||
    !isTeamRole(row.role)
  ) {
    return null
  }

  return {
    membership_id: row.membership_id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    role: row.role,
  }
}

function parseTeamMember(value: unknown): TeamMember | null {
  if (!isRecord(value)) {
    return null
  }

  const row: TeamMemberRpcRow = {
    id: value.id,
    organization_id: value.organization_id,
    user_id: value.user_id,
    role: value.role,
    created_at: value.created_at,
    full_name: value.full_name,
    email: value.email,
    avatar_url: value.avatar_url,
  }

  if (
    typeof row.id !== 'string' ||
    typeof row.organization_id !== 'string' ||
    typeof row.user_id !== 'string' ||
    typeof row.created_at !== 'string' ||
    !isTeamRole(row.role)
  ) {
    return null
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    profile: {
      full_name:
        typeof row.full_name === 'string' ? row.full_name : null,
      email: typeof row.email === 'string' ? row.email : null,
      avatar_url:
        typeof row.avatar_url === 'string' ? row.avatar_url : null,
    },
  }
}

export const getCurrentOrganization = cache(
  async (): Promise<CurrentOrganizationMembership | null> => {
    const supabase = await createClient()

    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims()

    const userId = claimsData?.claims?.sub

    if (
      claimsError ||
      typeof userId !== 'string' ||
      userId.length === 0
    ) {
      return null
    }

    const platformMembership =
      await getCurrentPlatformMembership()

    if (platformMembership) {
      return null
    }

    const { data, error } = await supabase.rpc(
      'get_current_organization_membership',
    )

    if (error) {
      throw new Error(
        `Failed to load the active organization: ${error.message}`,
      )
    }

    const rawMembership = Array.isArray(data)
      ? data[0] ?? null
      : data

    return parseCurrentMembership(rawMembership)
  },
)

export const getCurrentOrganizationTimezone = cache(
  async (): Promise<string> => {
    const membership = await getCurrentOrganization()
    if (!membership) return 'UTC'

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('timezone')
      .eq('id', membership.organization_id)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Failed to load the organization timezone: ${error.message}`,
      )
    }

    const timezone = data?.timezone
    return typeof timezone === 'string' && timezone.trim()
      ? timezone.trim()
      : 'UTC'
  },
)

export async function setActiveOrganization(
  organizationId: string,
): Promise<CurrentOrganizationMembership> {
  const normalizedOrganizationId = organizationId.trim()

  if (!normalizedOrganizationId) {
    throw new Error('Organization ID is required.')
  }

  const platformMembership =
    await getCurrentPlatformMembership()

  if (platformMembership) {
    throw new Error(
      'Flowtix Platform staff accounts cannot select a customer workspace.',
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'set_active_organization',
    {
      target_organization_id: normalizedOrganizationId,
    },
  )

  if (error || !data) {
    throw new Error(
      error?.message ?? 'Unable to select the organization.',
    )
  }

  const { data: membershipData, error: membershipError } =
    await supabase.rpc('get_current_organization_membership')

  if (membershipError) {
    throw new Error(
      `Unable to load the selected organization membership: ${membershipError.message}`,
    )
  }

  const rawMembership = Array.isArray(membershipData)
    ? membershipData[0] ?? null
    : membershipData
  const membership = parseCurrentMembership(rawMembership)

  if (
    !membership ||
    membership.organization_id !== normalizedOrganizationId
  ) {
    throw new Error(
      'Unable to load the selected organization membership.',
    )
  }

  return membership
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const organization = await getCurrentOrganization()

  if (!organization) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'get_current_organization_team_members',
  )

  if (error) {
    throw new Error(
      `Failed to load team members: ${error.message}`,
    )
  }

  const rows: unknown[] = Array.isArray(data) ? data : []

  return rows.flatMap((row): TeamMember[] => {
    const member = parseTeamMember(row)
    return member ? [member] : []
  })
}

export async function getInvitations(): Promise<
  TeamInvitation[]
> {
  const organization = await getCurrentOrganization()

  if (!organization) {
    return []
  }

  const supabase = await createClient()
  const currentTimestamp = new Date().toISOString()

  const { data, error } = await supabase
    .from('organization_invitations')
    .select(`
      id,
      organization_id,
      email,
      role,
      token,
      invited_by,
      accepted_by,
      expires_at,
      accepted_at,
      revoked_at,
      created_at,
      updated_at
    `)
    .eq('organization_id', organization.organization_id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', currentTimestamp)
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    throw new Error(
      `Failed to load team invitations: ${error.message}`,
    )
  }

  return (data ?? []).flatMap((invitation) => {
    if (!isTeamRole(invitation.role)) {
      return []
    }

    return [
      {
        id: invitation.id,
        organization_id: invitation.organization_id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        invited_by: invitation.invited_by,
        accepted_by: invitation.accepted_by,
        expires_at: invitation.expires_at,
        accepted_at: invitation.accepted_at,
        revoked_at: invitation.revoked_at,
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      },
    ]
  })
}
