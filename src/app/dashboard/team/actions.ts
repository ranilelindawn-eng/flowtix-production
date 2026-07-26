'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import {
  getCurrentOrganization,
  type TeamRole,
} from '@/lib/team'

const VALID_ROLES: TeamRole[] = [
  'owner',
  'admin',
  'manager',
  'supervisor',
  'agent',
]

function normalizeEmail(
  value: FormDataEntryValue | null,
): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeRole(
  value: FormDataEntryValue | null,
): TeamRole {
  const role = String(value ?? '').trim().toLowerCase()

  if (!VALID_ROLES.includes(role as TeamRole)) {
    return 'agent'
  }

  return role as TeamRole
}

function getFormString(
  formData: FormData,
  key: string,
): string {
  return String(formData.get(key) ?? '').trim()
}

async function requireTeamManager() {
  const supabase = await createClient()
 
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('You must be signed in.')
  }

  const organization = await getCurrentOrganization()

  if (!organization) {
    throw new Error('Organization not found.')
  }

  if (
    organization.role !== 'owner' &&
    organization.role !== 'admin'
  ) {
    throw new Error(
      'Only organization owners and administrators can manage the team.',
    )
  }

  return {
    supabase,
    user,
    organization,
  }
}

function revalidateTeamPages() {
  revalidatePath('/dashboard/team')
  revalidatePath('/dashboard')
}

export async function inviteTeamMember(
  formData: FormData,
) {
  const { supabase, user, organization } =
    await requireTeamManager()

  const email = normalizeEmail(formData.get('email'))
  const role = normalizeRole(formData.get('role'))

  if (!email) {
    throw new Error('Email is required.')
  }

  if (role === 'owner' && organization.role !== 'owner') {
    throw new Error(
      'Only the organization owner can invite another owner.',
    )
  }

  const { data: existingInvitation, error: invitationError } =
    await supabase
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', organization.organization_id)
      .eq('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

  if (invitationError) {
    throw new Error(
      `Failed to check pending invitations: ${invitationError.message}`,
    )
  }

  if (existingInvitation) {
    throw new Error(
      'This email already has an active invitation.',
    )
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data: invitation, error } = await supabase
    .from('organization_invitations')
    .insert({
      organization_id: organization.organization_id,
      email,
      role,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select('token')
    .single()

  if (error) {
    throw new Error(
      `Failed to create invitation: ${error.message}`,
    )
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

  if (resendKey && fromEmail && siteUrl && invitation?.token) {
    const invitationUrl = `${siteUrl}/invite/${invitation.token}`
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: 'You are invited to join CallFlow',
        html: `<p>You were invited to join a CallFlow organization as <strong>${role}</strong>.</p><p><a href="${invitationUrl}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`,
      }),
    })

    if (!response.ok) {
      console.error('Invitation email failed:', await response.text())
    }
  }

  revalidateTeamPages()
}

export async function revokeInvitation(
  formData: FormData,
) {
  const { supabase, organization } =
    await requireTeamManager()

  const invitationId = getFormString(formData, 'id')

  if (!invitationId) {
    throw new Error('Invitation ID is missing.')
  }

  const { data: invitation, error: invitationError } =
    await supabase
      .from('organization_invitations')
      .select('id, organization_id, role, revoked_at, accepted_at')
      .eq('id', invitationId)
      .maybeSingle()

  if (invitationError) {
    throw new Error(
      `Failed to load invitation: ${invitationError.message}`,
    )
  }

  if (!invitation) {
    throw new Error('Invitation not found.')
  }

  if (
    invitation.organization_id !==
    organization.organization_id
  ) {
    throw new Error(
      'You cannot manage an invitation from another organization.',
    )
  }

  if (
    invitation.role === 'owner' &&
    organization.role !== 'owner'
  ) {
    throw new Error(
      'Only the organization owner can revoke an owner invitation.',
    )
  }

  if (invitation.accepted_at) {
    throw new Error(
      'An accepted invitation cannot be revoked.',
    )
  }

  if (invitation.revoked_at) {
    throw new Error('This invitation is already revoked.')
  }

  const { error } = await supabase
    .from('organization_invitations')
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq('id', invitationId)
    .eq(
      'organization_id',
      organization.organization_id,
    )

  if (error) {
    throw new Error(
      `Failed to revoke invitation: ${error.message}`,
    )
  }

  revalidateTeamPages()
}

export async function updateMemberRole(
  formData: FormData,
) {
  const { supabase, organization } =
    await requireTeamManager()

  const memberId = getFormString(formData, 'id')
  const newRole = normalizeRole(formData.get('role'))

  if (!memberId) {
    throw new Error('Member ID is missing.')
  }

  const { data: member, error: memberError } =
    await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, role')
      .eq('id', memberId)
      .maybeSingle()

  if (memberError) {
    throw new Error(
      `Failed to load team member: ${memberError.message}`,
    )
  }

  if (!member) {
    throw new Error('Team member not found.')
  }

  if (
    member.organization_id !==
    organization.organization_id
  ) {
    throw new Error(
      'You cannot manage a member from another organization.',
    )
  }

  const currentRole = member.role as TeamRole

  if (
    organization.role === 'admin' &&
    (currentRole === 'owner' ||
      currentRole === 'admin' ||
      newRole === 'owner')
  ) {
    throw new Error(
      'Administrators cannot modify owners or other administrators.',
    )
  }

  if (
    currentRole === 'owner' &&
    organization.role !== 'owner'
  ) {
    throw new Error(
      'Only an organization owner can modify another owner.',
    )
  }

  if (
    newRole === 'owner' &&
    organization.role !== 'owner'
  ) {
    throw new Error(
      'Only an organization owner can assign the owner role.',
    )
  }

  if (
    currentRole === 'owner' &&
    newRole !== 'owner'
  ) {
    const { count, error: ownerCountError } =
      await supabase
        .from('organization_members')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq(
          'organization_id',
          organization.organization_id,
        )
        .eq('role', 'owner')

    if (ownerCountError) {
      throw new Error(
        `Failed to verify organization owners: ${ownerCountError.message}`,
      )
    }

    if ((count ?? 0) <= 1) {
      throw new Error(
        'The organization must always have at least one owner.',
      )
    }
  }

  const { error } = await supabase
    .from('organization_members')
    .update({
      role: newRole,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .eq(
      'organization_id',
      organization.organization_id,
    )

  if (error) {
    throw new Error(
      `Failed to update member role: ${error.message}`,
    )
  }

  revalidateTeamPages()
}

export async function removeMember(
  formData: FormData,
) {
  const { supabase, user, organization } =
    await requireTeamManager()

  const memberId = getFormString(formData, 'id')

  if (!memberId) {
    throw new Error('Member ID is missing.')
  }

  const { data: member, error: memberError } =
    await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, role')
      .eq('id', memberId)
      .maybeSingle()

  if (memberError) {
    throw new Error(
      `Failed to load team member: ${memberError.message}`,
    )
  }

  if (!member) {
    throw new Error('Team member not found.')
  }

  if (
    member.organization_id !==
    organization.organization_id
  ) {
    throw new Error(
      'You cannot remove a member from another organization.',
    )
  }

  const memberRole = member.role as TeamRole

  if (memberRole === 'owner') {
    throw new Error(
      'Organization owners cannot be removed. Transfer or change ownership first.',
    )
  }

  if (
    organization.role === 'admin' &&
    memberRole === 'admin'
  ) {
    throw new Error(
      'Administrators cannot remove other administrators.',
    )
  }

  if (member.user_id === user.id) {
    throw new Error(
      'You cannot remove your own membership from this page.',
    )
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq(
      'organization_id',
      organization.organization_id,
    )

  if (error) {
    throw new Error(
      `Failed to remove team member: ${error.message}`,
    )
  }

  revalidateTeamPages()
}