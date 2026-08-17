import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import {
  assertStorageCapacity,
  getRecordingRetentionCutoff,
} from '@/lib/usage-limits'

export const RECORDINGS_PER_PAGE = 12
export const RECORDINGS_BUCKET = 'recordings'

export type Recording = {
  id: string
  organization_id: string
  call_id: string
  bucket_name: string
  storage_path: string
  duration_seconds: number | null
  mime_type: string | null
  size_bytes: number | null
  created_by: string
  created_at: string
  updated_at: string
}

export type RecordingCallOption = {
  id: string
  direction: 'outbound' | 'inbound'
  status: 'completed' | 'failed' | 'scheduled' | 'cancelled'
  started_at: string
}

export type RecordingFilters = {
  page?: number
  callId?: string
}

export type UploadRecordingInput = {
  callId: string
  file: File
  durationSeconds?: number | null
}

type RecordingContext = {
  supabase: NonNullable<
    Awaited<ReturnType<typeof createServerSupabaseClient>>
  >
  userId: string
  organizationId: string
}

async function getRecordingContext(): Promise<RecordingContext> {
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

function normalizeDuration(
  durationSeconds: number | null | undefined
): number | null {
  if (
    durationSeconds === null ||
    durationSeconds === undefined
  ) {
    return null
  }

  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 0
  ) {
    throw new Error(
      'Recording duration must be a whole number greater than or equal to zero.'
    )
  }

  return durationSeconds
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return sanitized || 'recording'
}

function createStoragePath(
  organizationId: string,
  callId: string,
  filename: string
): string {
  const timestamp = Date.now()
  const safeFilename = sanitizeFilename(filename)

  return `${organizationId}/${callId}/${timestamp}-${safeFilename}`
}

async function verifyCallBelongsToOrganization(
  callId: string,
  context: RecordingContext
): Promise<void> {
  const { supabase, organizationId } = context

  const { data, error } = await supabase
    .from('calls')
    .select('id')
    .eq('id', callId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(
      'The selected call does not exist or is outside your organization.'
    )
  }
}

export async function getRecordings(
  filters: RecordingFilters = {}
): Promise<{
  recordings: Recording[]
  count: number
}> {
  const { supabase, organizationId } =
    await getRecordingContext()

  const page = normalizePage(filters.page)
  const offset = (page - 1) * RECORDINGS_PER_PAGE
  const retentionCutoff = await getRecordingRetentionCutoff(
    organizationId,
  )

  let query = supabase
    .from('recordings')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .range(offset, offset + RECORDINGS_PER_PAGE - 1)
    .order('created_at', { ascending: false })

  if (filters.callId?.trim()) {
    query = query.eq('call_id', filters.callId.trim())
  }

  if (retentionCutoff) {
    query = query.gte('created_at', retentionCutoff)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return {
    recordings: (data ?? []) as Recording[],
    count: count ?? 0,
  }
}

export async function getRecording(
  id: string
): Promise<Recording | null> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    return null
  }

  const { supabase, organizationId } =
    await getRecordingContext()
  const retentionCutoff = await getRecordingRetentionCutoff(
    organizationId,
  )

  let query = supabase
    .from('recordings')
    .select('*')
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)

  if (retentionCutoff) {
    query = query.gte('created_at', retentionCutoff)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Recording | null
}

export async function getRecordingCalls(): Promise<
  RecordingCallOption[]
> {
  const { supabase, organizationId } =
    await getRecordingContext()

  const { data, error } = await supabase
    .from('calls')
    .select('id, direction, status, started_at')
    .eq('organization_id', organizationId)
    .order('started_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as RecordingCallOption[]
}

export async function uploadRecording(
  input: UploadRecordingInput
): Promise<Recording> {
  const context = await getRecordingContext()
  const { supabase, userId, organizationId } = context

  const callId = input.callId.trim()

  if (!callId) {
    throw new Error('A call must be selected.')
  }

  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new Error('A valid recording file is required.')
  }

  await assertStorageCapacity(input.file.size, organizationId)
  await verifyCallBelongsToOrganization(callId, context)

  const storagePath = createStoragePath(
    organizationId,
    callId,
    input.file.name
  )

  const mimeType =
    input.file.type.trim() || 'application/octet-stream'

  const { error: uploadError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, input.file, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data, error: insertError } = await supabase
    .from('recordings')
    .insert({
      organization_id: organizationId,
      call_id: callId,
      bucket_name: RECORDINGS_BUCKET,
      storage_path: storagePath,
      duration_seconds: normalizeDuration(
        input.durationSeconds
      ),
      mime_type: mimeType,
      size_bytes: input.file.size,
      created_by: userId,
    })
    .select('*')
    .single()

  if (insertError) {
    await supabase.storage
      .from(RECORDINGS_BUCKET)
      .remove([storagePath])

    throw new Error(insertError.message)
  }

  await supabase
    .from('calls')
    .update({
      recording_available: true,
    })
    .eq('id', callId)
    .eq('organization_id', organizationId)

  return data as Recording
}

export async function getRecordingSignedUrl(
  recording: Recording,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { supabase, organizationId } =
    await getRecordingContext()

  if (recording.organization_id !== organizationId) {
    return null
  }

  const retentionCutoff = await getRecordingRetentionCutoff(
    organizationId,
  )

  if (
    retentionCutoff &&
    new Date(recording.created_at).getTime() <
      new Date(retentionCutoff).getTime()
  ) {
    return null
  }

  const { data, error } = await supabase.storage
    .from(recording.bucket_name)
    .createSignedUrl(
      recording.storage_path,
      expiresInSeconds
    )

  if (error) {
    console.error(
      'Unable to create recording signed URL:',
      error
    )

    return null
  }

  return data.signedUrl
}

export async function deleteRecording(
  id: string
): Promise<void> {
  const normalizedId = id.trim()

  if (!normalizedId) {
    throw new Error('A valid recording ID is required.')
  }

  const { supabase, organizationId } =
    await getRecordingContext()
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', normalizedId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (recordingError) {
    throw new Error(recordingError.message)
  }

  if (!recording) {
    throw new Error('Recording not found.')
  }

  const { error: storageError } = await supabase.storage
    .from(recording.bucket_name)
    .remove([recording.storage_path])

  if (storageError) {
    throw new Error(storageError.message)
  }

  const { error: deleteError } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recording.id)
    .eq('organization_id', organizationId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  const { count, error: countError } = await supabase
    .from('recordings')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('call_id', recording.call_id)
    .eq('organization_id', organizationId)

  if (countError) {
    console.error(
      'Unable to check remaining recordings:',
      countError
    )

    return
  }

  if ((count ?? 0) === 0) {
    await supabase
      .from('calls')
      .update({
        recording_available: false,
      })
      .eq('id', recording.call_id)
      .eq('organization_id', organizationId)
  }
}