import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export const SUMMARIES_PER_PAGE = 12

export type SummarySentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed'

export type Summary = {
  id: string
  organization_id: string
  transcript_id: string
  title: string | null
  summary: string
  key_points: string | null
  action_items: string | null
  sentiment: string | null
  provider: string
  created_by: string
  created_at: string
  updated_at: string
}

export type SummaryTranscriptOption = {
  id: string
  recording_id: string
  language: string
  provider: string
  content: string
  created_at: string
}

export type SummaryFilters = {
  page?: number
  search?: string
  transcriptId?: string
  sentiment?: string
}

export type SummaryFormValues = {
  transcriptId: string
  title: string
  summary: string
  keyPoints: string
  actionItems: string
  sentiment: string
  provider: string
}

type SummaryContext = {
  supabase: NonNullable<
    Awaited<ReturnType<typeof createServerSupabaseClient>>
  >
  userId: string
  organizationId: string
}

async function getSummaryContext(): Promise<SummaryContext> {
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
    throw new Error('Unable to verify the authenticated user.')
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
      'Unable to determine the organization for the current user.'
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

function normalizeRequiredText(
  value: string,
  fieldName: string
): string {
  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`${fieldName} is required.`)
  }

  return normalized
}

function normalizeOptionalText(
  value: string,
  maximumLength?: number,
  fieldName = 'Value'
): string | null {
  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (
    typeof maximumLength === 'number' &&
    normalized.length > maximumLength
  ) {
    throw new Error(
      `${fieldName} must be ${maximumLength.toLocaleString()} characters or fewer.`
    )
  }

  return normalized
}

function normalizeTitle(title: string): string | null {
  return normalizeOptionalText(title, 200, 'Title')
}

function normalizeSummary(summary: string): string {
  const normalized = normalizeRequiredText(
    summary,
    'Summary'
  )

  if (normalized.length > 250_000) {
    throw new Error('Summary content is too large.')
  }

  return normalized
}

function normalizeLongOptionalText(
  value: string,
  fieldName: string
): string | null {
  return normalizeOptionalText(value, 250_000, fieldName)
}

function normalizeProvider(provider: string): string {
  const normalized = normalizeRequiredText(
    provider,
    'Provider'
  )

  if (normalized.length > 100) {
    throw new Error(
      'Provider must be 100 characters or fewer.'
    )
  }

  return normalized
}

function normalizeSentiment(
  sentiment: string
): SummarySentiment | null {
  const normalized = sentiment.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  const allowedSentiments: SummarySentiment[] = [
    'positive',
    'neutral',
    'negative',
    'mixed',
  ]

  if (
    !allowedSentiments.includes(
      normalized as SummarySentiment
    )
  ) {
    throw new Error(
      'Sentiment must be positive, neutral, negative, or mixed.'
    )
  }

  return normalized as SummarySentiment
}

async function verifyTranscriptBelongsToOrganization(
  transcriptId: string,
  context: SummaryContext
): Promise<void> {
  const { supabase, organizationId } = context

  const { data, error } = await supabase
    .from('transcripts')
    .select('id')
    .eq('id', transcriptId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'The selected transcript does not exist or is outside your organization.'
    )
  }
}

export async function getSummaries(
  filters: SummaryFilters = {}
): Promise<{
  summaries: Summary[]
  count: number
}> {
  const { supabase, organizationId } =
    await getSummaryContext()

  const page = normalizePage(filters.page)
  const offset = (page - 1) * SUMMARIES_PER_PAGE

  let query = supabase
    .from('summaries')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .range(offset, offset + SUMMARIES_PER_PAGE - 1)
    .order('created_at', { ascending: false })

  if (filters.transcriptId?.trim()) {
    query = query.eq(
      'transcript_id',
      filters.transcriptId.trim()
    )
  }

  if (filters.sentiment?.trim()) {
    query = query.eq(
      'sentiment',
      filters.sentiment.trim().toLowerCase()
    )
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim()

    query = query.or(
      `title.ilike.%${search}%,summary.ilike.%${search}%,key_points.ilike.%${search}%,action_items.ilike.%${search}%,provider.ilike.%${search}%`
    )
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return {
    summaries: (data ?? []) as Summary[],
    count: count ?? 0,
  }
}

export async function getSummary(
  id: string
): Promise<Summary | null> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    return null
  }

  const { supabase, organizationId } =
    await getSummaryContext()

  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Summary | null
}

export async function getSummaryTranscripts(): Promise<
  SummaryTranscriptOption[]
> {
  const { supabase, organizationId } =
    await getSummaryContext()

  const { data, error } = await supabase
    .from('transcripts')
    .select(
      'id, recording_id, language, provider, content, created_at'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as SummaryTranscriptOption[]
}

export async function createSummary(
  values: SummaryFormValues
): Promise<Summary> {
  const context = await getSummaryContext()
  const { supabase, userId, organizationId } = context

  const transcriptId = normalizeRequiredText(
    values.transcriptId,
    'Transcript'
  )

  await verifyTranscriptBelongsToOrganization(
    transcriptId,
    context
  )

  const { data, error } = await supabase
    .from('summaries')
    .insert({
      organization_id: organizationId,
      transcript_id: transcriptId,
      title: normalizeTitle(values.title),
      summary: normalizeSummary(values.summary),
      key_points: normalizeLongOptionalText(
        values.keyPoints,
        'Key points'
      ),
      action_items: normalizeLongOptionalText(
        values.actionItems,
        'Action items'
      ),
      sentiment: normalizeSentiment(values.sentiment),
      provider: normalizeProvider(values.provider),
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Summary
}

export async function updateSummary(
  id: string,
  values: SummaryFormValues
): Promise<Summary> {
  const context = await getSummaryContext()
  const { supabase, organizationId } = context

  const normalizedId = normalizeRequiredText(
    id,
    'Summary ID'
  )

  const transcriptId = normalizeRequiredText(
    values.transcriptId,
    'Transcript'
  )

  await verifyTranscriptBelongsToOrganization(
    transcriptId,
    context
  )

  const { data, error } = await supabase
    .from('summaries')
    .update({
      transcript_id: transcriptId,
      title: normalizeTitle(values.title),
      summary: normalizeSummary(values.summary),
      key_points: normalizeLongOptionalText(
        values.keyPoints,
        'Key points'
      ),
      action_items: normalizeLongOptionalText(
        values.actionItems,
        'Action items'
      ),
      sentiment: normalizeSentiment(values.sentiment),
      provider: normalizeProvider(values.provider),
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'Summary not found or you do not have permission to update it.'
    )
  }

  return data as Summary
}

export async function deleteSummary(
  id: string
): Promise<void> {
  const normalizedId = normalizeRequiredText(
    id,
    'Summary ID'
  )

  const { supabase, organizationId } =
    await getSummaryContext()

  const { data, error } = await supabase
    .from('summaries')
    .delete()
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'Summary not found or you do not have permission to delete it.'
    )
  }
}