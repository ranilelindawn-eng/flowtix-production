import {
  enqueueCanonicalPostCallDispatch,
  evaluateCanonicalPostCallTrigger,
} from '@/lib/automation/post-call/trigger'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { NormalizedCallEvent } from './types'

const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

function validDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function applyNormalizedCallEvent(input: {
  organizationId: string
  event: NormalizedCallEvent
}): Promise<{ duplicate: boolean; callId: string | null }> {
  const admin = createTelephonyAdminClient()
  const event = input.event
  const occurredAt = validDate(event.occurredAt)?.toISOString() ?? new Date().toISOString()

  const { data: inserted, error: insertError } = await admin
    .from('telephony_provider_events')
    .insert({
      organization_id: input.organizationId,
      provider: event.provider,
      provider_event_id: event.eventId,
      event_type: event.eventType,
      provider_call_id: event.providerCallId || null,
      provider_parent_call_id: event.providerParentCallId,
      provider_recording_id: event.providerRecordingId,
      normalized_status: event.status,
      raw_status: event.rawStatus,
      occurred_at: occurredAt,
      payload: event.rawPayload,
      metadata: event.metadata,
    })
    .select('id')
    .maybeSingle()

  if (insertError) {
    if (insertError.code === '23505') return { duplicate: true, callId: null }
    throw new Error(`Unable to persist provider event: ${insertError.message}`)
  }
  if (!inserted) return { duplicate: true, callId: null }

  const identifiers = [event.providerCallId, event.providerParentCallId].filter(Boolean) as string[]
  if (identifiers.length === 0) return { duplicate: false, callId: null }

  const identifierFilter = identifiers
    .flatMap((id) => [`provider_call_sid.eq.${id}`, `provider_child_call_sid.eq.${id}`])
    .join(',')
  const { data: call, error: callError } = await admin
    .from('calls')
    .select('id,created_by,organization_id,provider_event_at,status')
    .eq('organization_id', input.organizationId)
    .eq('provider', event.provider)
    .or(identifierFilter)
    .limit(1)
    .maybeSingle()

  if (callError) throw new Error(`Unable to resolve provider call: ${callError.message}`)
  if (!call) return { duplicate: false, callId: null }

  if (event.eventType === 'recording.status' && event.providerRecordingId && event.recordingUrl) {
    const { error: recordingError } = await admin.from('call_recordings').upsert(
      {
        organization_id: input.organizationId,
        call_id: call.id,
        provider: event.provider,
        provider_recording_sid: event.providerRecordingId,
        provider_url: event.recordingUrl,
        status: event.rawStatus || 'completed',
        duration_seconds: event.durationSeconds ?? 0,
        channels: event.recordingChannels ?? 1,
        created_by: call.created_by,
      },
      { onConflict: 'provider_recording_sid' },
    )
    if (recordingError) {
      throw new Error(`Unable to persist provider recording: ${recordingError.message}`)
    }

    const { error: callUpdateError } = await admin
      .from('calls')
      .update({
        recording_available: true,
        provider_event_at: occurredAt,
        provider_status_raw: event.rawStatus,
      })
      .eq('id', call.id)
      .eq('organization_id', input.organizationId)
    if (callUpdateError) {
      throw new Error(`Unable to update call recording state: ${callUpdateError.message}`)
    }
    return { duplicate: false, callId: call.id }
  }

  if (!event.status) return { duplicate: false, callId: call.id }

  const currentEventAt = call.provider_event_at ? validDate(call.provider_event_at) : null
  const incomingEventAt = validDate(occurredAt)
  if (currentEventAt && incomingEventAt && incomingEventAt.getTime() < currentEventAt.getTime()) {
    return { duplicate: false, callId: call.id }
  }

  if (terminalStatuses.has(call.status) && !terminalStatuses.has(event.status)) {
    return { duplicate: false, callId: call.id }
  }

  const update: Record<string, unknown> = {
    status: event.status,
    provider_event_at: occurredAt,
    provider_status_raw: event.rawStatus,
    provider_parent_call_id: event.providerParentCallId,
    updated_at: new Date().toISOString(),
  }
  if (event.durationSeconds !== null) update.duration_seconds = event.durationSeconds
  if (terminalStatuses.has(event.status)) update.ended_at = occurredAt

  const { error: updateError } = await admin
    .from('calls')
    .update(update)
    .eq('id', call.id)
    .eq('organization_id', input.organizationId)
  if (updateError) throw new Error(`Unable to update provider call: ${updateError.message}`)

  if (
    event.eventType === 'call.status' &&
    terminalStatuses.has(event.status)
  ) {
    try {
      const trigger = await evaluateCanonicalPostCallTrigger({
        organizationId: input.organizationId,
        callId: call.id,
        previousStatus: call.status,
        status: event.status,
        occurredAt,
      })

      if (trigger.eligible) {
        const job = await enqueueCanonicalPostCallDispatch(trigger)

        console.info('Canonical post-call automation job queued.', {
          organizationId: trigger.organizationId,
          callId: trigger.callId,
          status: trigger.status,
          emailEnabled: trigger.emailEnabled,
          smsEnabled: trigger.smsEnabled,
          delaySeconds: trigger.delaySeconds,
          jobId: job?.id ?? null,
          jobStatus: job?.status ?? null,
          scheduledAt: job?.scheduled_at ?? null,
        })
      }
    } catch (triggerError) {
      // A post-call automation evaluation failure must never roll back or
      // invalidate an otherwise valid telephony lifecycle update.
      console.error(
        'Unable to evaluate canonical post-call automation trigger:',
        triggerError,
      )
    }
  }

  return { duplicate: false, callId: call.id }
}
