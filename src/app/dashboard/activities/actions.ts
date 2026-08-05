'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const text = (formData: FormData, key: string) => formData.get(key)?.toString().trim() ?? ''

export async function createActivity(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')
  const contactId = text(formData, 'contactId') || null
  const companyId = text(formData, 'companyId') || null
  const opportunityId = text(formData, 'opportunityId') || null
  const subject = text(formData, 'subject')
  if (!subject) throw new Error('Activity subject is required.')
  if (!contactId && !companyId && !opportunityId) throw new Error('An activity must be linked to a CRM record.')
  const durationValue = text(formData, 'durationSeconds')
  const durationSeconds = durationValue ? Number.parseInt(durationValue, 10) : null
  if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 604800)) throw new Error('Duration must be between 0 and 604,800 seconds.')
  const occurredValue = text(formData, 'occurredAt')
  const { error } = await supabase.from('crm_activities').insert({
    organization_id: organization.organization_id,
    contact_id: contactId,
    company_id: companyId,
    opportunity_id: opportunityId,
    activity_type: text(formData, 'activityType') || 'other',
    direction: text(formData, 'direction') || 'internal',
    status: text(formData, 'status') || 'completed',
    subject,
    body: text(formData, 'body') || null,
    outcome: text(formData, 'outcome') || null,
    occurred_at: occurredValue ? new Date(occurredValue).toISOString() : new Date().toISOString(),
    duration_seconds: durationSeconds,
    source: 'manual',
    visibility: text(formData, 'visibility') || 'organization',
    owner_membership_id: organization.membership_id,
    created_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/activities')
  if (contactId) revalidatePath(`/dashboard/contacts/${contactId}`)
}

export async function deleteActivity(formData: FormData) {
  await requirePermission('contacts.update')
  const supabase = await createClient()
  const id = text(formData, 'activityId')
  if (!id) throw new Error('Activity ID is required.')
  const { error } = await supabase.from('crm_activities').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/activities')
}
