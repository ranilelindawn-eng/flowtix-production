import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export const CALLS_PER_PAGE = 12

export type CallDirection = 'outbound' | 'inbound'

export type CallStatus =
  | 'completed'
  | 'failed'
  | 'scheduled'
  | 'cancelled'

export type Call = {
  id: string
  organization_id: string
  campaign_id: string | null
  contact_id: string | null
  direction: CallDirection
  status: CallStatus
  started_at: string
  duration_seconds: number | null
  recording_available: boolean
  notes: string | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

export type CallFormValues = {
  campaign_id: string
  contact_id: string
  direction: CallDirection
  status: CallStatus
  started_at: string
  duration_seconds: string
  recording_available: boolean
  notes: string
}

export type CallFilters = {
  search?: string
  direction?: CallDirection | 'all'
  status?: CallStatus | 'all'
  page?: number
}

export type CallContactOption = {
  id: string
  first_name: string
  last_name: string
  email: string
}

export type CallCampaignOption = {
  id: string
  name: string
}

type CallContext = {
  supabase: NonNullable<
    Awaited<ReturnType<typeof createServerSupabaseClient>>
  >
  userId: string
  organizationId: string
}

async function getCallContext(): Promise<CallContext> {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Missing Supabase environment variables or authentication context.',
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
      'Unable to determine organization for the current user.',
    )
  }

  return {
    supabase,
    userId,
    organizationId,
  }
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isInteger(page) || page < 1) {
    return 1
  }

  return page
}

function normalizeOptionalId(value: string): string | null {
  const normalizedValue = value.trim()

  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizeOptionalText(value: string): string | null {
  const normalizedValue = value.trim()

  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizeDuration(value: string): number | null {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return null
  }

  const duration = Number(normalizedValue)

  if (!Number.isInteger(duration) || duration < 0) {
    throw new Error(
      'Duration must be a whole number greater than or equal to zero.',
    )
  }

  return duration
}

function normalizeStartedAt(value: string): string {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return new Date().toISOString()
  }

  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) {
    throw new Error('A valid call date and time is required.')
  }

  return date.toISOString()
}

async function validateDialerContact(
  context: CallContext,
  contactId: string | undefined,
): Promise<string | null> {
  const normalizedContactId = contactId?.trim() ?? ''

  if (!normalizedContactId) {
    return null
  }

  const { data, error } = await context.supabase
    .from('contacts')
    .select('id')
    .eq('id', normalizedContactId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'The selected contact was not found or does not belong to your organization.',
    )
  }

  return data.id
}

export async function getCalls(
  filters: CallFilters = {},
): Promise<{
  calls: Call[]
  count: number
}> {
  const { supabase, organizationId } = await getCallContext()

  const page = normalizePage(filters.page)
  const offset = (page - 1) * CALLS_PER_PAGE

  let query = supabase
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .range(offset, offset + CALLS_PER_PAGE - 1)
    .order('started_at', { ascending: false })

  if (filters.direction && filters.direction !== 'all') {
    query = query.eq('direction', filters.direction)
  }

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return {
    calls: (data ?? []) as Call[],
    count: count ?? 0,
  }
}

export async function getCall(id: string): Promise<Call | null> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    return null
  }

  const { supabase, organizationId } = await getCallContext()

  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Call | null
}

export async function getCallContacts(): Promise<
  CallContactOption[]
> {
  const { supabase, organizationId } = await getCallContext()

  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email')
    .eq('organization_id', organizationId)
    .order('first_name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as CallContactOption[]
}

export async function getCallCampaigns(): Promise<
  CallCampaignOption[]
> {
  const { supabase, organizationId } = await getCallContext()

  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as CallCampaignOption[]
}

export async function createCall(
  values: CallFormValues,
): Promise<Call> {
  const { supabase, userId, organizationId } =
    await getCallContext()

  const { data, error } = await supabase
    .from('calls')
    .insert({
      organization_id: organizationId,
      campaign_id: normalizeOptionalId(values.campaign_id),
      contact_id: normalizeOptionalId(values.contact_id),
      direction: values.direction,
      status: values.status,
      started_at: normalizeStartedAt(values.started_at),
      duration_seconds: normalizeDuration(
        values.duration_seconds,
      ),
      recording_available: values.recording_available,
      notes: normalizeOptionalText(values.notes),
      metadata: {},
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Call
}

export async function updateCall(
  id: string,
  values: CallFormValues,
): Promise<Call> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    throw new Error('A valid call ID is required.')
  }

  const { supabase, organizationId } = await getCallContext()

  const { data, error } = await supabase
    .from('calls')
    .update({
      campaign_id: normalizeOptionalId(values.campaign_id),
      contact_id: normalizeOptionalId(values.contact_id),
      direction: values.direction,
      status: values.status,
      started_at: normalizeStartedAt(values.started_at),
      duration_seconds: normalizeDuration(
        values.duration_seconds,
      ),
      recording_available: values.recording_available,
      notes: normalizeOptionalText(values.notes),
    })
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Call
}

export async function deleteCall(id: string): Promise<void> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    throw new Error('A valid call ID is required.')
  }

  const { supabase, organizationId } = await getCallContext()

  const { error } = await supabase
    .from('calls')
    .delete()
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)

  if (error) {
    throw new Error(error.message)
  }
}

export type CreateDialerCallInput = {
  phoneNumber: string
  contactId?: string
  direction: CallDirection
  status: CallStatus
  startedAt: string
  durationSeconds: number
  notes?: string
}

export async function createDialerCall(
  input: CreateDialerCallInput,
): Promise<Call> {
  const context = await getCallContext()

  const phoneNumber = input.phoneNumber.trim()

  if (!phoneNumber) {
    throw new Error('A phone number is required.')
  }

  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < 0
  ) {
    throw new Error(
      'Call duration must be a whole number greater than or equal to zero.',
    )
  }

  const startedAt = new Date(input.startedAt)

  if (Number.isNaN(startedAt.getTime())) {
    throw new Error('A valid call start time is required.')
  }

  const contactId = await validateDialerContact(
    context,
    input.contactId,
  )

  const { data, error } = await context.supabase
    .from('calls')
    .insert({
      organization_id: context.organizationId,
      campaign_id: null,
      contact_id: contactId,
      direction: input.direction,
      status: input.status,
      started_at: startedAt.toISOString(),
      duration_seconds: input.durationSeconds,
      recording_available: false,
      notes: normalizeOptionalText(input.notes ?? ''),
      metadata: {
        phone_number: phoneNumber,
        source: 'dialer',
      },
      created_by: context.userId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Call
}