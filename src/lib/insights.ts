import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export const INSIGHTS_PER_PAGE = 12

export type InsightSentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed'

export type Insight = {
  id: string
  organization_id: string
  transcript_id: string
  summary_id: string | null
  sentiment: string | null
  talk_ratio: number | null
  objection_count: number
  keyword_count: number
  recommendation: string | null
  provider: string
  created_by: string
  created_at: string
  updated_at: string
}

export type InsightTranscriptOption = {
  id: string
  language: string
  created_at: string
}

export type InsightSummaryOption = {
  id: string
  transcript_id: string
  title: string | null
  created_at: string
}

export type InsightFilters = {
  page?: number
  search?: string
  sentiment?: string
  transcriptId?: string
}

export type InsightFormValues = {
  transcriptId: string
  summaryId?: string
  sentiment?: string
  talkRatio?: string | number
  objectionCount?: string | number
  keywordCount?: string | number
  recommendation?: string
  provider: string
}

type InsightContext = {
  userId: string
  organizationId: string
}

async function getSupabaseClient() {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Check your environment variables.'
    )
  }

  return supabase
}

async function getInsightContext(): Promise<InsightContext> {
  const supabase = await getSupabaseClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  const userId = claimsData?.claims?.sub

  if (claimsError || !userId) {
    throw new Error('You must be signed in to access insights.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (profile?.organization_id) {
    return {
      userId,
      organizationId: profile.organization_id,
    }
  }

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

  if (!membership?.organization_id) {
    throw new Error(
      'Your account is not connected to an active organization.'
    )
  }

  return {
    userId,
    organizationId: membership.organization_id,
  }
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  maxLength: number
): string {
  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`${fieldName} is required.`)
  }

  if (normalized.length > maxLength) {
    throw new Error(
      `${fieldName} must be ${maxLength} characters or fewer.`
    )
  }

  return normalized
}

function normalizeOptionalText(
  value: string | undefined,
  maxLength: number
): string | null {
  const normalized = value?.trim() ?? ''

  if (!normalized) {
    return null
  }

  if (normalized.length > maxLength) {
    throw new Error(
      `Value must be ${maxLength} characters or fewer.`
    )
  }

  return normalized
}

function normalizeSentiment(
  value: string | undefined
): InsightSentiment | null {
  const normalized = value?.trim().toLowerCase() ?? ''

  if (!normalized) {
    return null
  }

  const allowed: InsightSentiment[] = [
    'positive',
    'neutral',
    'negative',
    'mixed',
  ]

  if (!allowed.includes(normalized as InsightSentiment)) {
    throw new Error('Invalid sentiment value.')
  }

  return normalized as InsightSentiment
}

function normalizeTalkRatio(
  value: string | number | undefined
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null
  }

  const normalized = Number(value)

  if (!Number.isFinite(normalized)) {
    throw new Error('Talk ratio must be a valid number.')
  }

  if (normalized < 0 || normalized > 100) {
    throw new Error(
      'Talk ratio must be between 0 and 100.'
    )
  }

  return Number(normalized.toFixed(2))
}

function normalizeCount(
  value: string | number | undefined,
  fieldName: string
): number {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 0
  }

  const normalized = Number(value)

  if (
    !Number.isInteger(normalized) ||
    normalized < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative whole number.`
    )
  }

  return normalized
}

async function verifyTranscriptBelongsToOrganization(
  transcriptId: string,
  organizationId: string
): Promise<void> {
  const supabase = await getSupabaseClient()

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
    throw new Error('The selected transcript is invalid.')
  }
}

async function verifySummaryBelongsToOrganization(
  summaryId: string,
  transcriptId: string,
  organizationId: string
): Promise<void> {
  const supabase = await getSupabaseClient()

  const { data, error } = await supabase
    .from('summaries')
    .select('id')
    .eq('id', summaryId)
    .eq('transcript_id', transcriptId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'The selected summary does not belong to this transcript.'
    )
  }
}

export async function getInsights(
  filters: InsightFilters = {}
): Promise<{
  insights: Insight[]
  count: number
}> {
  const supabase = await getSupabaseClient()
  const { organizationId } = await getInsightContext()

  const page =
    Number.isInteger(filters.page) && (filters.page ?? 0) > 0
      ? filters.page!
      : 1

  const from = (page - 1) * INSIGHTS_PER_PAGE
  const to = from + INSIGHTS_PER_PAGE - 1

  let query = supabase
    .from('insights')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .range(from, to)

  const search = filters.search?.trim()

  if (search) {
    const safeSearch = search.replace(/[%_,()]/g, ' ')

    query = query.or(
      `recommendation.ilike.%${safeSearch}%,provider.ilike.%${safeSearch}%`
    )
  }

  const sentiment = filters.sentiment
    ?.trim()
    .toLowerCase()

  if (sentiment) {
    query = query.eq('sentiment', sentiment)
  }

  const transcriptId = filters.transcriptId?.trim()

  if (transcriptId) {
    query = query.eq('transcript_id', transcriptId)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(error.message)
  }

  return {
    insights: (data ?? []) as Insight[],
    count: count ?? 0,
  }
}

export async function getInsight(
  id: string
): Promise<Insight | null> {
  const insightId = normalizeRequiredText(
    id,
    'Insight ID',
    100
  )

  const supabase = await getSupabaseClient()
  const { organizationId } = await getInsightContext()

  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('id', insightId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as Insight | null) ?? null
}

export async function getInsightTranscripts(): Promise<
  InsightTranscriptOption[]
> {
  const supabase = await getSupabaseClient()
  const { organizationId } = await getInsightContext()

  const { data, error } = await supabase
    .from('transcripts')
    .select('id, language, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as InsightTranscriptOption[]
}

export async function getInsightSummaries(
  transcriptId?: string
): Promise<InsightSummaryOption[]> {
  const supabase = await getSupabaseClient()
  const { organizationId } = await getInsightContext()

  let query = supabase
    .from('summaries')
    .select('id, transcript_id, title, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  const normalizedTranscriptId = transcriptId?.trim()

  if (normalizedTranscriptId) {
    query = query.eq(
      'transcript_id',
      normalizedTranscriptId
    )
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as InsightSummaryOption[]
}

export async function createInsight(
  values: InsightFormValues
): Promise<Insight> {
  const transcriptId = normalizeRequiredText(
    values.transcriptId,
    'Transcript',
    100
  )

  const summaryId = normalizeOptionalText(
    values.summaryId,
    100
  )

  const provider = normalizeRequiredText(
    values.provider,
    'Provider',
    100
  )

  const recommendation = normalizeOptionalText(
    values.recommendation,
    10000
  )

  const sentiment = normalizeSentiment(values.sentiment)

  const talkRatio = normalizeTalkRatio(values.talkRatio)

  const objectionCount = normalizeCount(
    values.objectionCount,
    'Objection count'
  )

  const keywordCount = normalizeCount(
    values.keywordCount,
    'Keyword count'
  )

  const supabase = await getSupabaseClient()

  const { userId, organizationId } =
    await getInsightContext()

  await verifyTranscriptBelongsToOrganization(
    transcriptId,
    organizationId
  )

  if (summaryId) {
    await verifySummaryBelongsToOrganization(
      summaryId,
      transcriptId,
      organizationId
    )
  }

  const { data, error } = await supabase
    .from('insights')
    .insert({
      organization_id: organizationId,
      transcript_id: transcriptId,
      summary_id: summaryId,
      sentiment,
      talk_ratio: talkRatio,
      objection_count: objectionCount,
      keyword_count: keywordCount,
      recommendation,
      provider,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Insight
}

export async function updateInsight(
  id: string,
  values: InsightFormValues
): Promise<Insight> {
  const insightId = normalizeRequiredText(
    id,
    'Insight ID',
    100
  )

  const transcriptId = normalizeRequiredText(
    values.transcriptId,
    'Transcript',
    100
  )

  const summaryId = normalizeOptionalText(
    values.summaryId,
    100
  )

  const provider = normalizeRequiredText(
    values.provider,
    'Provider',
    100
  )

  const recommendation = normalizeOptionalText(
    values.recommendation,
    10000
  )

  const sentiment = normalizeSentiment(values.sentiment)

  const talkRatio = normalizeTalkRatio(values.talkRatio)

  const objectionCount = normalizeCount(
    values.objectionCount,
    'Objection count'
  )

  const keywordCount = normalizeCount(
    values.keywordCount,
    'Keyword count'
  )

  const supabase = await getSupabaseClient()
  const { organizationId } = await getInsightContext()

  await verifyTranscriptBelongsToOrganization(
    transcriptId,
    organizationId
  )

  if (summaryId) {
    await verifySummaryBelongsToOrganization(
      summaryId,
      transcriptId,
      organizationId
    )
  }

  const { data, error } = await supabase
    .from('insights')
    .update({
      transcript_id: transcriptId,
      summary_id: summaryId,
      sentiment,
      talk_ratio: talkRatio,
      objection_count: objectionCount,
      keyword_count: keywordCount,
      recommendation,
      provider,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insightId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'Insight not found or you do not have permission to update it.'
    )
  }

  return data as Insight
}

export async function deleteInsight(
  id: string
): Promise<void> {
  const insightId = normalizeRequiredText(
    id,
    'Insight ID',
    100
  )

  const supabase = await getSupabaseClient()
  const { organizationId } = await getInsightContext()

  const { error } = await supabase
    .from('insights')
    .delete()
    .eq('id', insightId)
    .eq('organization_id', organizationId)

  if (error) {
    throw new Error(error.message)
  }
}