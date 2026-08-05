import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

export const TRANSCRIPTS_PER_PAGE = 12

export type Transcript = {
  id: string
  organization_id: string
  recording_id: string
  language: string
  content: string
  provider: string
  created_by: string
  created_at: string
  updated_at: string
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
  processing_version?: number | null
  normalized_content?: string | null
  redacted_content?: string | null
  detected_language?: string | null
  speaker_count?: number
  word_count?: number
  quality_score?: number | null
  processing_confidence?: number | null
  processed_at?: string | null
  processing_metadata?: Record<string, unknown>
}

export type TranscriptFilters = {
  page?: number
  recordingId?: string
  search?: string
}

export type TranscriptFormValues = {
  recordingId: string
  language: string
  content: string
  provider: string
}

export type TranscriptRecordingOption = {
  id: string
  call_id: string
  storage_path: string
  mime_type: string | null
  duration_seconds: number | null
  created_at: string
}

type TranscriptContext = {
  supabase: NonNullable<
    Awaited<ReturnType<typeof createServerSupabaseClient>>
  >
  userId: string
  organizationId: string
}

async function getTranscriptContext(): Promise<TranscriptContext> {
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

function normalizeLanguage(language: string): string {
  const normalized = normalizeRequiredText(language, 'Language')

  if (normalized.length > 50) {
    throw new Error(
      'Language must be 50 characters or fewer.'
    )
  }

  return normalized
}

function normalizeProvider(provider: string): string {
  const normalized = normalizeRequiredText(provider, 'Provider')

  if (normalized.length > 100) {
    throw new Error(
      'Provider must be 100 characters or fewer.'
    )
  }

  return normalized
}

function normalizeContent(content: string): string {
  const normalized = normalizeRequiredText(
    content,
    'Transcript content'
  )

  if (normalized.length > 1_000_000) {
    throw new Error(
      'Transcript content is too large.'
    )
  }

  return normalized
}

async function verifyRecordingBelongsToOrganization(
  recordingId: string,
  context: TranscriptContext
): Promise<void> {
  const { supabase, organizationId } = context

  const { data, error } = await supabase
    .from('recordings')
    .select('id')
    .eq('id', recordingId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'The selected recording does not exist or is outside your organization.'
    )
  }
}

export async function getTranscripts(
  filters: TranscriptFilters = {}
): Promise<{
  transcripts: Transcript[]
  count: number
}> {
  const { supabase, organizationId } =
    await getTranscriptContext()

  const page = normalizePage(filters.page)
  const offset = (page - 1) * TRANSCRIPTS_PER_PAGE

  let query = supabase
    .from('transcripts')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .range(offset, offset + TRANSCRIPTS_PER_PAGE - 1)
    .order('created_at', { ascending: false })

  if (filters.recordingId?.trim()) {
    query = query.eq(
      'recording_id',
      filters.recordingId.trim()
    )
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim()

    query = query.or(
      `content.ilike.%${search}%,language.ilike.%${search}%,provider.ilike.%${search}%`
    )
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return {
    transcripts: (data ?? []) as Transcript[],
    count: count ?? 0,
  }
}

export async function getTranscript(
  id: string
): Promise<Transcript | null> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    return null
  }

  const { supabase, organizationId } =
    await getTranscriptContext()

  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Transcript | null
}

export async function getTranscriptRecordings(): Promise<
  TranscriptRecordingOption[]
> {
  const { supabase, organizationId } =
    await getTranscriptContext()

  const { data, error } = await supabase
    .from('recordings')
    .select(
      'id, call_id, storage_path, mime_type, duration_seconds, created_at'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as TranscriptRecordingOption[]
}

export async function createTranscript(
  values: TranscriptFormValues
): Promise<Transcript> {
  const context = await getTranscriptContext()
  const { supabase, userId, organizationId } = context

  const recordingId = normalizeRequiredText(
    values.recordingId,
    'Recording'
  )

  await verifyRecordingBelongsToOrganization(
    recordingId,
    context
  )

  const { data, error } = await supabase
    .from('transcripts')
    .insert({
      organization_id: organizationId,
      recording_id: recordingId,
      language: normalizeLanguage(values.language),
      content: normalizeContent(values.content),
      provider: normalizeProvider(values.provider),
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Transcript
}

export async function updateTranscript(
  id: string,
  values: TranscriptFormValues
): Promise<Transcript> {
  const context = await getTranscriptContext()
  const { supabase, organizationId } = context

  const normalizedId = normalizeRequiredText(
    id,
    'Transcript ID'
  )

  const recordingId = normalizeRequiredText(
    values.recordingId,
    'Recording'
  )

  await verifyRecordingBelongsToOrganization(
    recordingId,
    context
  )

  const { data, error } = await supabase
    .from('transcripts')
    .update({
      recording_id: recordingId,
      language: normalizeLanguage(values.language),
      content: normalizeContent(values.content),
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
      'Transcript not found or you do not have permission to update it.'
    )
  }

  return data as Transcript
}

export async function deleteTranscript(
  id: string
): Promise<void> {
  const normalizedId = normalizeRequiredText(
    id,
    'Transcript ID'
  )

  const { supabase, organizationId } =
    await getTranscriptContext()

  const { data, error } = await supabase
    .from('transcripts')
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
      'Transcript not found or you do not have permission to delete it.'
    )
  }
}