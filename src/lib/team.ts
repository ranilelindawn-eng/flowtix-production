import { cache } from 'react'

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
  organization_id: string
  role: TeamRole
}

type OrganizationMembershipRow = CurrentOrganizationMembership & {
  created_at: string
}

function isTeamRole(value: unknown): value is TeamRole {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'manager' ||
    value === 'agent'
  )
}

function isMembershipRow(
  value: OrganizationMembershipRow,
): value is OrganizationMembershipRow {
  return (
    typeof value.organization_id === 'string' &&
    value.organization_id.length > 0 &&
    isTeamRole(value.role)
  )
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

    const [profileResult, membershipResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('organization_members')
        .select('organization_id, role, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: true }),
    ])

    if (profileResult.error) {
      throw new Error(
        `Failed to load the active organization: ${profileResult.error.message}`,
      )
    }

    if (membershipResult.error) {
      throw new Error(
        `Failed to load organization memberships: ${membershipResult.error.message}`,
      )
    }

    const memberships = (membershipResult.data ?? []).filter(
      isMembershipRow,
    )

    if (memberships.length === 0) {
      return null
    }

    const activeOrganizationId =
      typeof profileResult.data?.organization_id === 'string'
        ? profileResult.data.organization_id
        : null

    const selectedMembership =
      memberships.find(
        (membership) =>
          membership.organization_id === activeOrganizationId,
      ) ?? memberships[0]

    if (!selectedMembership) {
      return null
    }

    if (
      selectedMembership.organization_id !== activeOrganizationId
    ) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          organization_id: selectedMembership.organization_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (updateError) {
        throw new Error(
          `Failed to repair the active organization: ${updateError.message}`,
        )
      }
    }

    return {
      organization_id: selectedMembership.organization_id,
      role: selectedMembership.role,
    }
  },
)

export async function setActiveOrganization(
  organizationId: string,
): Promise<CurrentOrganizationMembership> {
  const normalizedOrganizationId = organizationId.trim()

  if (!normalizedOrganizationId) {
    throw new Error('Organization ID is required.')
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

  const { data: membership, error: membershipError } =
    await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('organization_id', normalizedOrganizationId)
      .eq('status', 'active')
      .maybeSingle()

  if (
    membershipError ||
    !membership ||
    !isTeamRole(membership.role)
  ) {
    throw new Error(
      membershipError?.message ??
        'Unable to load the selected organization membership.',
    )
  }

  return {
    organization_id: membership.organization_id,
    role: membership.role,
  }
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const organization = await getCurrentOrganization()

  if (!organization) {
    return []
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      id,
      organization_id,
      user_id,
      role,
      created_at,
      profile:profiles (
        full_name,
        email,
        avatar_url
      )
    `)
    .eq('organization_id', organization.organization_id)
    .order('created_at', {
      ascending: true,
    })

  if (error) {
    throw new Error(
      `Failed to load team members: ${error.message}`,
    )
  }

  return (data ?? []).flatMap((member) => {
    if (!isTeamRole(member.role)) {
      return []
    }

    const profile = Array.isArray(member.profile)
      ? member.profile[0] ?? null
      : member.profile

    return [
      {
        id: member.id,
        organization_id: member.organization_id,
        user_id: member.user_id,
        role: member.role,
        created_at: member.created_at,
        profile: profile
          ? {
              full_name: profile.full_name,
              email: profile.email,
              avatar_url: profile.avatar_url,
            }
          : null,
      },
    ]
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
