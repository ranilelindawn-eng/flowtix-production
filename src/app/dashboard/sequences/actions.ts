'use server'

import { revalidatePath } from 'next/cache'

import { assertEntitlement } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

function text(formData: FormData, key: string) {
  const item = formData.get(key)
  return typeof item === 'string' ? item.trim() : ''
}

async function context() {
  await assertEntitlement('automation.sequences')
  const membership = await getCurrentOrganization()

  if (!membership || !hasPermission(membership.role, 'campaigns.update')) {
    throw new Error('You do not have permission to manage sequences.')
  }

  return { membership, supabase: await createClient() }
}

export async function setSequenceStatus(formData: FormData) {
  const { membership, supabase } = await context()
  const sequenceId = text(formData, 'sequence_id')
  const status = text(formData, 'status')

  if (!sequenceId || !['active', 'paused', 'archived', 'draft'].includes(status)) {
    throw new Error('Invalid sequence status.')
  }

  const { error } = await supabase
    .from('sequences')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sequenceId)
    .eq('organization_id', membership.organization_id)

  if (error) throw new Error(error.message)

  if (status !== 'active') {
    const nextEnrollmentStatus = status === 'archived' ? 'cancelled' : 'paused'
    const { error: enrollmentError } = await supabase
      .from('sequence_enrollments')
      .update({
        status: nextEnrollmentStatus,
        paused_at: status === 'paused' ? new Date().toISOString() : null,
        cancelled_at: status === 'archived' ? new Date().toISOString() : null,
        next_run_at: null,
      })
      .eq('sequence_id', sequenceId)
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')

    if (enrollmentError) throw new Error(enrollmentError.message)
  }

  revalidatePath('/dashboard/sequences')
}

export async function enrollContact(formData: FormData) {
  const { membership, supabase } = await context()
  const sequenceId = text(formData, 'sequence_id')
  const contactId = text(formData, 'contact_id')
  const ownerMembershipId =
    text(formData, 'owner_membership_id') || membership.membership_id

  if (!sequenceId || !contactId) {
    throw new Error('Sequence and contact are required.')
  }

  const { error } = await supabase.rpc('enroll_contact_in_sequence', {
    p_sequence_id: sequenceId,
    p_contact_id: contactId,
    p_owner_membership_id: ownerMembershipId,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/sequences')
}

export async function updateEnrollmentStatus(formData: FormData) {
  const { membership, supabase } = await context()
  const enrollmentId = text(formData, 'enrollment_id')
  const status = text(formData, 'status')

  if (!enrollmentId || !['active', 'paused', 'cancelled'].includes(status)) {
    throw new Error('Invalid enrollment status.')
  }

  const now = new Date().toISOString()
  const update =
    status === 'active'
      ? {
          status,
          next_run_at: now,
          paused_at: null,
          cancelled_at: null,
          last_error: null,
        }
      : {
          status,
          next_run_at: null,
          paused_at: status === 'paused' ? now : null,
          cancelled_at: status === 'cancelled' ? now : null,
        }

  const { error } = await supabase
    .from('sequence_enrollments')
    .update(update)
    .eq('id', enrollmentId)
    .eq('organization_id', membership.organization_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/sequences')
}
