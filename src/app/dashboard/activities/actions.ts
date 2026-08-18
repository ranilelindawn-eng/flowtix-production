'use server'

import { getCurrentOrganizationTimezone } from '@/lib/team'
import { organizationLocalDateTimeToUtc } from '@/lib/timezone'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const text = (formData: FormData, key: string) => formData.get(key)?.toString().trim() ?? ''

const ACTIVITY_TYPES = new Set(['call', 'email', 'sms', 'meeting', 'note', 'task', 'status_change', 'web', 'social', 'other'])
const ACTIVITY_DIRECTIONS = new Set(['inbound', 'outbound', 'internal'])
const ACTIVITY_STATUSES = new Set(['planned', 'in_progress', 'completed', 'cancelled', 'failed'])
const ACTIVITY_VISIBILITIES = new Set(['private', 'team', 'organization'])

function validateChoice(value: string, allowed: Set<string>, fallback: string) {
  return allowed.has(value) ? value : fallback
}

function parseDuration(value: string) {
  if (!value) return null
  const durationSeconds = Number.parseInt(value, 10)
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 604800) {
    throw new Error('Duration must be between 0 and 604,800 seconds.')
  }
  return durationSeconds
}

async function validateRelationships(input: {
  organizationId: string
  contactId: string | null
  companyId: string | null
  opportunityId: string | null
}) {
  const supabase = await createClient()

  const [contactResult, companyResult, opportunityResult] = await Promise.all([
    input.contactId
      ? supabase.from('contacts').select('id').eq('organization_id', input.organizationId).eq('id', input.contactId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.companyId
      ? supabase.from('companies').select('id').eq('organization_id', input.organizationId).eq('id', input.companyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.opportunityId
      ? supabase.from('opportunities').select('id').eq('organization_id', input.organizationId).eq('id', input.opportunityId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (contactResult.error) throw new Error(contactResult.error.message)
  if (companyResult.error) throw new Error(companyResult.error.message)
  if (opportunityResult.error) throw new Error(opportunityResult.error.message)

  if (input.contactId && !contactResult.data) throw new Error('The selected contact does not belong to this organization.')
  if (input.companyId && !companyResult.data) throw new Error('The selected company does not belong to this organization.')
  if (input.opportunityId && !opportunityResult.data) throw new Error('The selected opportunity does not belong to this organization.')
}

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

  await validateRelationships({
    organizationId: organization.organization_id,
    contactId,
    companyId,
    opportunityId,
  })

  const occurredValue = text(formData, 'occurredAt')
  const timeZone = await getCurrentOrganizationTimezone()
  const { error } = await supabase.from('crm_activities').insert({
    organization_id: organization.organization_id,
    contact_id: contactId,
    company_id: companyId,
    opportunity_id: opportunityId,
    activity_type: validateChoice(text(formData, 'activityType'), ACTIVITY_TYPES, 'other'),
    direction: validateChoice(text(formData, 'direction'), ACTIVITY_DIRECTIONS, 'internal'),
    status: validateChoice(text(formData, 'status'), ACTIVITY_STATUSES, 'completed'),
    subject,
    body: text(formData, 'body') || null,
    outcome: text(formData, 'outcome') || null,
    occurred_at: occurredValue
      ? organizationLocalDateTimeToUtc(occurredValue, timeZone) ?? new Date().toISOString()
      : new Date().toISOString(),
    duration_seconds: parseDuration(text(formData, 'durationSeconds')),
    source: 'manual',
    visibility: validateChoice(text(formData, 'visibility'), ACTIVITY_VISIBILITIES, 'organization'),
    owner_membership_id: organization.membership_id,
    created_by: user.id,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/activities')
  if (contactId) revalidatePath(`/dashboard/contacts/${contactId}`)
}

export async function updateActivity(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const activityId = text(formData, 'activityId')
  if (!activityId) throw new Error('Activity ID is required.')

  const contactId = text(formData, 'contactId') || null
  const companyId = text(formData, 'companyId') || null
  const opportunityId = text(formData, 'opportunityId') || null
  const subject = text(formData, 'subject')

  if (!subject) throw new Error('Activity subject is required.')
  if (!contactId && !companyId && !opportunityId) throw new Error('An activity must be linked to a CRM record.')

  const { data: existing, error: loadError } = await supabase
    .from('crm_activities')
    .select('id,source,contact_id,visibility')
    .eq('organization_id', organization.organization_id)
    .eq('id', activityId)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (!existing) throw new Error('Activity not found.')
  if (existing.source !== 'manual') throw new Error('Automatic activities are read-only.')

  await validateRelationships({
    organizationId: organization.organization_id,
    contactId,
    companyId,
    opportunityId,
  })

  const occurredValue = text(formData, 'occurredAt')
  const timeZone = await getCurrentOrganizationTimezone()
  const occurredAt = occurredValue
    ? organizationLocalDateTimeToUtc(occurredValue, timeZone) ?? new Date().toISOString()
    : null

  const payload: Record<string, unknown> = {
    contact_id: contactId,
    company_id: companyId,
    opportunity_id: opportunityId,
    activity_type: validateChoice(text(formData, 'activityType'), ACTIVITY_TYPES, 'other'),
    direction: validateChoice(text(formData, 'direction'), ACTIVITY_DIRECTIONS, 'internal'),
    status: validateChoice(text(formData, 'status'), ACTIVITY_STATUSES, 'completed'),
    subject,
    body: text(formData, 'body') || null,
    outcome: text(formData, 'outcome') || null,
    duration_seconds: parseDuration(text(formData, 'durationSeconds')),
    visibility: validateChoice(existing.visibility ?? '', ACTIVITY_VISIBILITIES, 'organization'),
    updated_at: new Date().toISOString(),
  }

  if (occurredAt) payload.occurred_at = occurredAt

  const { error } = await supabase
    .from('crm_activities')
    .update(payload)
    .eq('organization_id', organization.organization_id)
    .eq('id', activityId)

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard/activities')
  revalidatePath(`/dashboard/activities/${activityId}`)
  if (existing.contact_id) revalidatePath(`/dashboard/contacts/${existing.contact_id}`)
  if (contactId) revalidatePath(`/dashboard/contacts/${contactId}`)
}

export async function deleteActivity(formData: FormData) {
  const organization = await requirePermission('contacts.update')
  const supabase = await createClient()
  const id = text(formData, 'activityId')
  if (!id) throw new Error('Activity ID is required.')

  const { data: existing, error: loadError } = await supabase
    .from('crm_activities')
    .select('id,source,contact_id')
    .eq('id', id)
    .eq('organization_id', organization.organization_id)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (!existing) throw new Error('Activity not found.')
  if (existing.source !== 'manual') throw new Error('Automatic activities cannot be deleted from Activities.')

  const { error } = await supabase
    .from('crm_activities')
    .delete()
    .eq('id', id)
    .eq('organization_id', organization.organization_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/activities')
  if (existing.contact_id) revalidatePath(`/dashboard/contacts/${existing.contact_id}`)
}
