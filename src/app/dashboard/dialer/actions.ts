'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import {
  createDialerCall,
  type CallDirection,
  type CallStatus,
} from '@/lib/calls'
import {
  getContactById,
  getContacts,
} from '@/lib/contacts'

export type DialerContact = {
  id: string
  name: string
  phoneNumber: string
  company?: string
}

type ContactForDialer = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  metadata: {
    mobile?: string
  }
}

const MAX_DIALER_SEARCH_RESULTS = 12

function mapDialerContact(
  input: ContactForDialer,
): DialerContact | null {
  const firstName = input.first_name.trim()
  const lastName = input.last_name.trim()

  const name =
    [firstName, lastName].filter(Boolean).join(' ') ||
    input.email.trim() ||
    'Unnamed contact'

  const primaryPhone = input.phone?.trim() ?? ''
  const mobilePhone = input.metadata.mobile?.trim() ?? ''
  const phoneNumber = primaryPhone || mobilePhone

  if (!phoneNumber) {
    return null
  }

  const dialerContact: DialerContact = {
    id: input.id,
    name,
    phoneNumber,
  }

  const company = input.company?.trim()

  if (company) {
    dialerContact.company = company
  }

  return dialerContact
}

export async function getRecentDialerContacts(): Promise<
  DialerContact[]
> {
  const { contacts } = await getContacts(
    '',
    'updated_at',
    1,
  )

  return contacts
    .map(mapDialerContact)
    .filter(
      (contact): contact is DialerContact =>
        contact !== null,
    )
}

export async function searchDialerContacts(
  query: string,
): Promise<DialerContact[]> {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return []
  }

  const { contacts } = await getContacts(
    normalizedQuery,
    'updated_at',
    1,
  )

  return contacts
    .map(mapDialerContact)
    .filter(
      (contact): contact is DialerContact =>
        contact !== null,
    )
    .slice(0, MAX_DIALER_SEARCH_RESULTS)
}


const MAX_ASSIGNED_DIALER_CONTACTS = 50

/**
 * Loads the dialer contact directory for the signed-in user.
 *
 * Agents are explicitly restricted to contacts assigned to their current
 * organization membership. Owners/admins/managers retain their existing
 * organization-wide contact visibility so supervisory calling workflows are
 * not broken. RLS remains an additional database boundary.
 */
export async function getAssignedDialerContacts(
  query = '',
): Promise<DialerContact[]> {
  const organization = await requirePermission('contacts.view')
  const supabase = await createClient()
  const normalizedQuery = query
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)

  let contactQuery = supabase
    .from('contacts')
    .select('id,first_name,last_name,email,phone,company,metadata')
    .eq('organization_id', organization.organization_id)
    .is('merged_into_contact_id', null)

  if (organization.role === 'agent') {
    contactQuery = contactQuery.eq(
      'owner_membership_id',
      organization.membership_id,
    )
  }

  if (normalizedQuery) {
    const pattern = `%${normalizedQuery}%`
    contactQuery = contactQuery.or(
      [
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
      ].join(','),
    )
  }

  const { data, error } = await contactQuery
    .order('updated_at', { ascending: false })
    .limit(MAX_ASSIGNED_DIALER_CONTACTS)

  if (error) {
    throw new Error(
      `Unable to load assigned dialer contacts: ${error.message}`,
    )
  }

  return (data ?? [])
    .map((contact) =>
      mapDialerContact(contact as ContactForDialer),
    )
    .filter(
      (contact): contact is DialerContact =>
        contact !== null,
    )
}

export async function getDialerContactById(
  contactId: string,
): Promise<DialerContact | null> {
  const normalizedContactId = contactId.trim()

  if (!normalizedContactId) {
    return null
  }

  const organization = await requirePermission('contacts.view')
  const contact = await getContactById(
    normalizedContactId,
  )

  if (!contact) {
    return null
  }

  if (
    organization.role === 'agent' &&
    contact.owner_membership_id !== organization.membership_id
  ) {
    return null
  }

  return mapDialerContact(contact)
}

export async function saveDialerCall(input: {
  phoneNumber: string
  contactId?: string
  direction: CallDirection
  status: CallStatus
  startedAt: string
  durationSeconds: number
  notes?: string
}) {
  await createDialerCall({
    phoneNumber: input.phoneNumber,
    contactId: input.contactId?.trim() || undefined,
    direction: input.direction,
    status: input.status,
    startedAt: input.startedAt,
    durationSeconds: input.durationSeconds,
    notes: input.notes?.trim() || undefined,
  })

  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/dialer')
}

const callOutcomes = [
  'connected',
  'no_answer',
  'busy',
  'voicemail',
  'wrong_number',
  'callback',
  'sale_closed',
  'not_interested',
] as const

const leadStatuses = [
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
] as const

export type DialerCallOutcome = (typeof callOutcomes)[number]
export type DialerLeadStatus = (typeof leadStatuses)[number]

function isCallOutcome(value: string): value is DialerCallOutcome {
  return callOutcomes.includes(value as DialerCallOutcome)
}

function isLeadStatus(value: string): value is DialerLeadStatus {
  return leadStatuses.includes(value as DialerLeadStatus)
}

export async function saveDialerContactUpdate(input: {
  contactId: string
  outcome: string
  leadStatus: string
  notes?: string
  followUpAt?: string
  createFollowUpTask?: boolean
}) {
  const organization = await requirePermission('contacts.update')
  const contactId = input.contactId.trim()
  const outcome = input.outcome.trim()
  const leadStatus = input.leadStatus.trim()
  const notes = input.notes?.trim() ?? ''
  const followUpAt = input.followUpAt?.trim() ?? ''

  if (!contactId) {
    throw new Error('Choose a CRM contact before saving a call update.')
  }

  if (!isCallOutcome(outcome)) {
    throw new Error('Choose a valid call outcome.')
  }

  if (!isLeadStatus(leadStatus)) {
    throw new Error('Choose a valid lead status.')
  }

  if (notes.length > 5000) {
    throw new Error('Call notes cannot exceed 5,000 characters.')
  }

  if (input.createFollowUpTask && !followUpAt) {
    throw new Error('Choose a follow-up date and time.')
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Authentication required.')
  }

  let contactQuery = supabase
    .from('contacts')
    .select('id,organization_id,first_name,last_name,email,owner_membership_id')
    .eq('id', contactId)
    .eq('organization_id', organization.organization_id)

  if (organization.role === 'agent') {
    contactQuery = contactQuery.eq(
      'owner_membership_id',
      organization.membership_id,
    )
  }

  const { data: contact, error: contactError } =
    await contactQuery.maybeSingle()

  if (contactError) {
    throw new Error(`Failed to load contact: ${contactError.message}`)
  }

  if (!contact) {
    throw new Error('The selected contact was not found or is not accessible.')
  }

  const now = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('contacts')
    .update({
      lead_status: leadStatus,
      last_call_outcome: outcome,
      last_contacted_at: now,
      updated_at: now,
    })
    .eq('id', contact.id)
    .eq('organization_id', organization.organization_id)

  if (updateError) {
    throw new Error(`Failed to update contact: ${updateError.message}`)
  }

  const outcomeLabel = outcome.replaceAll('_', ' ')
  const statusLabel = leadStatus.replaceAll('_', ' ')
  const timelineBody = [
    `Call outcome: ${outcomeLabel}`,
    `Lead status: ${statusLabel}`,
    notes ? `Notes: ${notes}` : '',
    followUpAt ? `Follow-up: ${new Date(followUpAt).toLocaleString('en-US')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const { error: noteError } = await supabase.from('contact_notes').insert({
    organization_id: organization.organization_id,
    contact_id: contact.id,
    body: timelineBody,
    created_by: user.id,
  })

  if (noteError) {
    throw new Error(`Contact updated, but the timeline note failed: ${noteError.message}`)
  }

  if (input.createFollowUpTask && followUpAt) {
    const contactName =
      [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
      contact.email ||
      'contact'

    const { data: taskOwnerMembership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    const { error: taskError } = await supabase.from('contact_tasks').insert({
      organization_id: organization.organization_id,
      contact_id: contact.id,
      title: `Follow up with ${contactName}`,
      description: notes || `Follow up after call outcome: ${outcomeLabel}.`,
      due_at: followUpAt,
      status: 'pending',
      priority: leadStatus === 'qualified' || leadStatus === 'negotiation'
        ? 'high'
        : 'medium',
      assigned_to: user.id,
      owner_membership_id: taskOwnerMembership?.id ?? null,
      created_by: user.id,
      completed_at: null,
    })

    if (taskError) {
      throw new Error(`Contact updated, but the follow-up task failed: ${taskError.message}`)
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/contacts')
  revalidatePath(`/dashboard/contacts/${contact.id}`)
  revalidatePath('/dashboard/dialer')
  revalidatePath('/dashboard/tasks')

  return {
    success: true,
    savedAt: now,
  }
}
