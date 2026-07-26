import { createServerSupabaseClient } from '@/lib/supabase/server'

export const CAMPAIGN_MEMBERS_PER_PAGE = 20

export type CampaignMemberStatus =
  | 'pending'
  | 'calling'
  | 'completed'
  | 'failed'
  | 'skipped'

export type CampaignMemberContact = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  title: string | null
  status: 'active' | 'inactive' | 'archived'
}

export type CampaignMemberCampaign = {
  id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'completed'
}

export type CampaignMember = {
  id: string
  organization_id: string
  campaign_id: string
  contact_id: string
  status: CampaignMemberStatus
  priority: number
  retry_count: number
  last_called_at: string | null
  last_disposition: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  contact?: CampaignMemberContact | null
  campaign?: CampaignMemberCampaign | null
}

export type CampaignMemberFilters = {
  campaignId: string
  search?: string
  status?: CampaignMemberStatus | 'all'
  sort?: 'created_at' | 'priority' | 'contact_name' | 'last_called_at'
  page?: number
}

export type CampaignMemberFormValues = {
  status: CampaignMemberStatus
  priority: number
  retry_count: number
  last_called_at: string
  last_disposition: string
  notes: string
}

export type AddCampaignMemberValues = {
  campaignId: string
  contactId: string
  priority?: number
  notes?: string
}

export type BulkAddCampaignMembersValues = {
  campaignId: string
  contactIds: string[]
  priority?: number
  notes?: string
}

export type DialQueueFilters = {
  campaignId: string
  statuses?: CampaignMemberStatus[]
  limit?: number
}

type CampaignMemberContext = {
  supabase: NonNullable<
    Awaited<ReturnType<typeof createServerSupabaseClient>>
  >
  userId: string
  organizationId: string
}

type CampaignMemberRow = {
  id: string
  organization_id: string
  campaign_id: string
  contact_id: string
  status: CampaignMemberStatus
  priority: number
  retry_count: number
  last_called_at: string | null
  last_disposition: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  contact:
    | CampaignMemberContact
    | CampaignMemberContact[]
    | null
  campaign:
    | CampaignMemberCampaign
    | CampaignMemberCampaign[]
    | null
}

async function getCampaignMemberContext(): Promise<CampaignMemberContext> {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Missing Supabase environment variables or authentication context.'
    )
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError) {
    throw new Error(claimsError.message)
  }

  const userId = claimsData?.claims?.sub

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Unable to verify authenticated user.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('Unable to load user profile:', profileError)
  }

  let organizationId: string | null =
    profile?.organization_id ?? null

  if (!organizationId) {
    const { data: membership, error: membershipError } =
      await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

    if (membershipError) {
      throw new Error(membershipError.message)
    }

    organizationId = membership?.organization_id ?? null
  }

  if (!organizationId) {
    throw new Error(
      'Unable to determine organization for the current user.'
    )
  }

  return {
    supabase,
    userId,
    organizationId,
  }
}

function normalizeId(value: string, label: string): string {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new Error(`A valid ${label} is required.`)
  }

  return normalizedValue
}

function normalizeOptionalValue(value?: string): string | null {
  const normalizedValue = value?.trim() ?? ''

  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isInteger(page) || page < 1) {
    return 1
  }

  return page
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  label: string,
  fallback = 0
): number {
  if (value === undefined) {
    return fallback
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }

  return value
}

function normalizeLimit(limit: number | undefined): number {
  if (!limit || !Number.isInteger(limit) || limit < 1) {
    return 50
  }

  return Math.min(limit, 200)
}

function sanitizeSearchValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

function mapCampaignMember(row: CampaignMemberRow): CampaignMember {
  return {
    id: row.id,
    organization_id: row.organization_id,
    campaign_id: row.campaign_id,
    contact_id: row.contact_id,
    status: row.status,
    priority: row.priority,
    retry_count: row.retry_count,
    last_called_at: row.last_called_at,
    last_disposition: row.last_disposition,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    contact: unwrapRelation(row.contact),
    campaign: unwrapRelation(row.campaign),
  }
}

async function assertCampaignBelongsToOrganization(
  context: CampaignMemberContext,
  campaignId: string
): Promise<void> {
  const { data, error } = await context.supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Campaign not found.')
  }
}

async function assertContactBelongsToOrganization(
  context: CampaignMemberContext,
  contactId: string
): Promise<void> {
  const { data, error } = await context.supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('Contact not found.')
  }
}

export async function getCampaignMembers(
  filters: CampaignMemberFilters
): Promise<{
  members: CampaignMember[]
  count: number
}> {
  const campaignId = normalizeId(
    filters.campaignId,
    'campaign ID'
  )

  const context = await getCampaignMemberContext()
  await assertCampaignBelongsToOrganization(context, campaignId)

  const page = normalizePage(filters.page)
  const offset = (page - 1) * CAMPAIGN_MEMBERS_PER_PAGE

  let query = context.supabase
    .from('campaign_members')
    .select(
      `
        *,
        contact:contacts!campaign_members_contact_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          company,
          title,
          status
        ),
        campaign:campaigns!campaign_members_campaign_id_fkey(
          id,
          name,
          status
        )
      `,
      { count: 'exact' }
    )
    .eq('organization_id', context.organizationId)
    .eq('campaign_id', campaignId)
    .range(offset, offset + CAMPAIGN_MEMBERS_PER_PAGE - 1)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  const search = filters.search?.trim()

  if (search) {
    const sanitizedSearch = sanitizeSearchValue(search)

    const { data: matchingContacts, error: contactSearchError } =
      await context.supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', context.organizationId)
        .or(
          [
            `first_name.ilike.%${sanitizedSearch}%`,
            `last_name.ilike.%${sanitizedSearch}%`,
            `email.ilike.%${sanitizedSearch}%`,
            `phone.ilike.%${sanitizedSearch}%`,
            `company.ilike.%${sanitizedSearch}%`,
          ].join(',')
        )

    if (contactSearchError) {
      throw new Error(contactSearchError.message)
    }

    const contactIds = (matchingContacts ?? []).map(
      (contact) => contact.id
    )

    if (contactIds.length === 0) {
      return {
        members: [],
        count: 0,
      }
    }

    query = query.in('contact_id', contactIds)
  }

  switch (filters.sort) {
    case 'priority':
      query = query
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
      break

    case 'last_called_at':
      query = query.order('last_called_at', {
        ascending: false,
        nullsFirst: false,
      })
      break

    case 'contact_name':
      query = query.order('created_at', { ascending: true })
      break

    case 'created_at':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  let members = ((data ?? []) as unknown as CampaignMemberRow[]).map(
    mapCampaignMember
  )

  if (filters.sort === 'contact_name') {
    members = members.sort((first, second) => {
      const firstName = [
        first.contact?.first_name,
        first.contact?.last_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()

      const secondName = [
        second.contact?.first_name,
        second.contact?.last_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()

      return firstName.localeCompare(secondName)
    })
  }

  return {
    members,
    count: count ?? 0,
  }
}

export async function getCampaignMember(
  id: string
): Promise<CampaignMember | null> {
  const normalizedId = normalizeId(id, 'campaign member ID')
  const context = await getCampaignMemberContext()

  const { data, error } = await context.supabase
    .from('campaign_members')
    .select(
      `
        *,
        contact:contacts!campaign_members_contact_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          company,
          title,
          status
        ),
        campaign:campaigns!campaign_members_campaign_id_fkey(
          id,
          name,
          status
        )
      `
    )
    .eq('id', normalizedId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  return mapCampaignMember(data as unknown as CampaignMemberRow)
}

export async function addCampaignMember(
  values: AddCampaignMemberValues
): Promise<CampaignMember> {
  const campaignId = normalizeId(
    values.campaignId,
    'campaign ID'
  )
  const contactId = normalizeId(values.contactId, 'contact ID')
  const priority = normalizeNonNegativeInteger(
    values.priority,
    'Priority'
  )

  const context = await getCampaignMemberContext()

  await Promise.all([
    assertCampaignBelongsToOrganization(context, campaignId),
    assertContactBelongsToOrganization(context, contactId),
  ])

  const { data, error } = await context.supabase
    .from('campaign_members')
    .insert({
      organization_id: context.organizationId,
      campaign_id: campaignId,
      contact_id: contactId,
      status: 'pending',
      priority,
      retry_count: 0,
      notes: normalizeOptionalValue(values.notes),
      created_by: context.userId,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        'This contact has already been added to the campaign.'
      )
    }

    throw new Error(error.message)
  }

  return data as CampaignMember
}

export async function bulkAddCampaignMembers(
  values: BulkAddCampaignMembersValues
): Promise<{
  addedCount: number
  skippedCount: number
}> {
  const campaignId = normalizeId(
    values.campaignId,
    'campaign ID'
  )
  const priority = normalizeNonNegativeInteger(
    values.priority,
    'Priority'
  )
  const contactIds = Array.from(
    new Set(
      values.contactIds
        .map((contactId) => contactId.trim())
        .filter(Boolean)
    )
  )

  if (contactIds.length === 0) {
    throw new Error('Select at least one contact.')
  }

  const context = await getCampaignMemberContext()
  await assertCampaignBelongsToOrganization(context, campaignId)

  const { data: contacts, error: contactsError } =
    await context.supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', context.organizationId)
      .in('id', contactIds)

  if (contactsError) {
    throw new Error(contactsError.message)
  }

  const validContactIds = (contacts ?? []).map(
    (contact) => contact.id
  )

  if (validContactIds.length === 0) {
    throw new Error(
      'None of the selected contacts belong to your organization.'
    )
  }

  const { data: existingMembers, error: existingMembersError } =
    await context.supabase
      .from('campaign_members')
      .select('contact_id')
      .eq('organization_id', context.organizationId)
      .eq('campaign_id', campaignId)
      .in('contact_id', validContactIds)

  if (existingMembersError) {
    throw new Error(existingMembersError.message)
  }

  const existingContactIds = new Set(
    (existingMembers ?? []).map((member) => member.contact_id)
  )

  const newContactIds = validContactIds.filter(
    (contactId) => !existingContactIds.has(contactId)
  )

  if (newContactIds.length === 0) {
    return {
      addedCount: 0,
      skippedCount: contactIds.length,
    }
  }

  const rows = newContactIds.map((contactId) => ({
    organization_id: context.organizationId,
    campaign_id: campaignId,
    contact_id: contactId,
    status: 'pending' as const,
    priority,
    retry_count: 0,
    notes: normalizeOptionalValue(values.notes),
    created_by: context.userId,
  }))

  const { error } = await context.supabase
    .from('campaign_members')
    .insert(rows)

  if (error) {
    throw new Error(error.message)
  }

  return {
    addedCount: newContactIds.length,
    skippedCount: contactIds.length - newContactIds.length,
  }
}

export async function updateCampaignMember(
  id: string,
  values: CampaignMemberFormValues
): Promise<CampaignMember> {
  const normalizedId = normalizeId(id, 'campaign member ID')
  const priority = normalizeNonNegativeInteger(
    values.priority,
    'Priority'
  )
  const retryCount = normalizeNonNegativeInteger(
    values.retry_count,
    'Retry count'
  )
  const context = await getCampaignMemberContext()

  const { data, error } = await context.supabase
    .from('campaign_members')
    .update({
      status: values.status,
      priority,
      retry_count: retryCount,
      last_called_at: normalizeOptionalValue(
        values.last_called_at
      ),
      last_disposition: normalizeOptionalValue(
        values.last_disposition
      ),
      notes: normalizeOptionalValue(values.notes),
    })
    .eq('id', normalizedId)
    .eq('organization_id', context.organizationId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as CampaignMember
}

export async function updateCampaignMemberStatus(
  id: string,
  status: CampaignMemberStatus,
  options: {
    lastCalledAt?: string
    lastDisposition?: string
    incrementRetryCount?: boolean
  } = {}
): Promise<CampaignMember> {
  const normalizedId = normalizeId(id, 'campaign member ID')
  const context = await getCampaignMemberContext()

  let retryCount: number | undefined

  if (options.incrementRetryCount) {
    const { data: existingMember, error: existingMemberError } =
      await context.supabase
        .from('campaign_members')
        .select('retry_count')
        .eq('id', normalizedId)
        .eq('organization_id', context.organizationId)
        .maybeSingle()

    if (existingMemberError) {
      throw new Error(existingMemberError.message)
    }

    if (!existingMember) {
      throw new Error('Campaign member not found.')
    }

    retryCount = existingMember.retry_count + 1
  }

  const updateValues: {
    status: CampaignMemberStatus
    last_called_at?: string | null
    last_disposition?: string | null
    retry_count?: number
  } = {
    status,
  }

  if (options.lastCalledAt !== undefined) {
    updateValues.last_called_at = normalizeOptionalValue(
      options.lastCalledAt
    )
  }

  if (options.lastDisposition !== undefined) {
    updateValues.last_disposition = normalizeOptionalValue(
      options.lastDisposition
    )
  }

  if (retryCount !== undefined) {
    updateValues.retry_count = retryCount
  }

  const { data, error } = await context.supabase
    .from('campaign_members')
    .update(updateValues)
    .eq('id', normalizedId)
    .eq('organization_id', context.organizationId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as CampaignMember
}

export async function removeCampaignMember(
  id: string
): Promise<void> {
  const normalizedId = normalizeId(id, 'campaign member ID')
  const context = await getCampaignMemberContext()

  const { error } = await context.supabase
    .from('campaign_members')
    .delete()
    .eq('id', normalizedId)
    .eq('organization_id', context.organizationId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function bulkRemoveCampaignMembers(
  ids: string[]
): Promise<number> {
  const normalizedIds = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  )

  if (normalizedIds.length === 0) {
    throw new Error('Select at least one campaign member.')
  }

  const context = await getCampaignMemberContext()

  const { data, error } = await context.supabase
    .from('campaign_members')
    .delete()
    .eq('organization_id', context.organizationId)
    .in('id', normalizedIds)
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  return data?.length ?? 0
}

export async function reorderCampaignMembers(
  campaignId: string,
  orderedMemberIds: string[]
): Promise<void> {
  const normalizedCampaignId = normalizeId(
    campaignId,
    'campaign ID'
  )
  const normalizedMemberIds = Array.from(
    new Set(
      orderedMemberIds
        .map((memberId) => memberId.trim())
        .filter(Boolean)
    )
  )

  if (normalizedMemberIds.length === 0) {
    throw new Error('Provide at least one campaign member.')
  }

  const context = await getCampaignMemberContext()
  await assertCampaignBelongsToOrganization(
    context,
    normalizedCampaignId
  )

  const { data: members, error: membersError } =
    await context.supabase
      .from('campaign_members')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('campaign_id', normalizedCampaignId)
      .in('id', normalizedMemberIds)

  if (membersError) {
    throw new Error(membersError.message)
  }

  if ((members ?? []).length !== normalizedMemberIds.length) {
    throw new Error(
      'One or more campaign members could not be found.'
    )
  }

  const totalMembers = normalizedMemberIds.length

  for (let index = 0; index < totalMembers; index += 1) {
    const memberId = normalizedMemberIds[index]
    const priority = totalMembers - index

    const { error } = await context.supabase
      .from('campaign_members')
      .update({ priority })
      .eq('id', memberId)
      .eq('organization_id', context.organizationId)
      .eq('campaign_id', normalizedCampaignId)

    if (error) {
      throw new Error(error.message)
    }
  }
}

export async function getDialQueue(
  filters: DialQueueFilters
): Promise<CampaignMember[]> {
  const campaignId = normalizeId(
    filters.campaignId,
    'campaign ID'
  )
  const context = await getCampaignMemberContext()
  await assertCampaignBelongsToOrganization(context, campaignId)

  const statuses =
    filters.statuses && filters.statuses.length > 0
      ? Array.from(new Set(filters.statuses))
      : (['pending', 'failed'] as CampaignMemberStatus[])

  const limit = normalizeLimit(filters.limit)

  const { data, error } = await context.supabase
    .from('campaign_members')
    .select(
      `
        *,
        contact:contacts!campaign_members_contact_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          company,
          title,
          status
        ),
        campaign:campaigns!campaign_members_campaign_id_fkey(
          id,
          name,
          status
        )
      `
    )
    .eq('organization_id', context.organizationId)
    .eq('campaign_id', campaignId)
    .in('status', statuses)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as unknown as CampaignMemberRow[]).map(
    mapCampaignMember
  )
}

export async function resetCampaignMemberForRetry(
  id: string
): Promise<CampaignMember> {
  const normalizedId = normalizeId(id, 'campaign member ID')
  const context = await getCampaignMemberContext()

  const { data, error } = await context.supabase
    .from('campaign_members')
    .update({
      status: 'pending',
      last_called_at: null,
      last_disposition: null,
    })
    .eq('id', normalizedId)
    .eq('organization_id', context.organizationId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as CampaignMember
}

export async function getCampaignMemberCounts(
  campaignId: string
): Promise<Record<CampaignMemberStatus | 'total', number>> {
  const normalizedCampaignId = normalizeId(
    campaignId,
    'campaign ID'
  )
  const context = await getCampaignMemberContext()
  await assertCampaignBelongsToOrganization(
    context,
    normalizedCampaignId
  )

  const { data, error } = await context.supabase
    .from('campaign_members')
    .select('status')
    .eq('organization_id', context.organizationId)
    .eq('campaign_id', normalizedCampaignId)

  if (error) {
    throw new Error(error.message)
  }

  const counts: Record<CampaignMemberStatus | 'total', number> = {
    total: 0,
    pending: 0,
    calling: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  }

  for (const member of data ?? []) {
    counts.total += 1
    counts[member.status as CampaignMemberStatus] += 1
  }

  return counts
}
