import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { NormalizedCallEvent } from './types'

const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

export async function applyNormalizedCallEvent(input: { organizationId: string; event: NormalizedCallEvent }): Promise<{ duplicate: boolean; callId: string | null }> {
  const admin = createTelephonyAdminClient()
  const event = input.event
  const { data: inserted, error: insertError } = await admin.from('telephony_provider_events').insert({
    organization_id: input.organizationId, provider: event.provider, provider_event_id: event.eventId,
    event_type: event.eventType, provider_call_id: event.providerCallId || null,
    provider_parent_call_id: event.providerParentCallId, provider_recording_id: event.providerRecordingId,
    normalized_status: event.status, raw_status: event.rawStatus, occurred_at: event.occurredAt,
    payload: event.rawPayload, metadata: event.metadata,
  }).select('id').maybeSingle()
  if (insertError) {
    if (insertError.code === '23505') return { duplicate: true, callId: null }
    throw new Error(`Unable to persist provider event: ${insertError.message}`)
  }
  if (!inserted) return { duplicate: true, callId: null }

  const identifiers = [event.providerCallId, event.providerParentCallId].filter(Boolean) as string[]
  let callQuery = admin.from('calls').select('id,created_by,organization_id').eq('organization_id', input.organizationId).eq('provider', event.provider)
  if (identifiers.length) callQuery = callQuery.or(identifiers.flatMap((id) => [`provider_call_sid.eq.${id}`, `provider_child_call_sid.eq.${id}`]).join(','))
  const { data: call } = identifiers.length ? await callQuery.limit(1).maybeSingle() : { data: null }
  if (!call) return { duplicate: false, callId: null }

  if (event.eventType === 'recording.status' && event.providerRecordingId && event.recordingUrl) {
    await admin.from('call_recordings').upsert({
      organization_id: input.organizationId, call_id: call.id, provider: event.provider,
      provider_recording_sid: event.providerRecordingId, provider_url: event.recordingUrl,
      status: event.rawStatus || 'completed', duration_seconds: event.durationSeconds ?? 0,
      channels: event.recordingChannels ?? 1, created_by: call.created_by,
    }, { onConflict: 'provider_recording_sid' })
    await admin.from('calls').update({ recording_available: true, provider_event_at: event.occurredAt, provider_status_raw: event.rawStatus }).eq('id', call.id).eq('organization_id', input.organizationId)
    return { duplicate: false, callId: call.id }
  }

  if (event.status) {
    const update: Record<string, unknown> = {
      status: event.status, provider_event_at: event.occurredAt, provider_status_raw: event.rawStatus,
      provider_parent_call_id: event.providerParentCallId, updated_at: new Date().toISOString(),
    }
    if (event.durationSeconds !== null) update.duration_seconds = event.durationSeconds
    if (terminalStatuses.has(event.status)) update.ended_at = event.occurredAt
    await admin.from('calls').update(update).eq('id', call.id).eq('organization_id', input.organizationId)
  }
  return { duplicate: false, callId: call.id }
}
