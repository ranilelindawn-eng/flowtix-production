import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

export type TeamRole = 'owner' | 'admin' | 'manager' | 'supervisor' | 'agent'

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

function isTeamRole(value: unknown): value is TeamRole {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'manager' ||
    value === 'supervisor' ||
    value === 'agent'
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

    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Failed to load the current organization: ${error.message}`,
      )
    }

    if (!data || !isTeamRole(data.role)) {
      return null
    }

    return {
      organization_id: data.organization_id,
      role: data.role,
    }
  },
)

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