import { createHash } from 'node:crypto'

import type { TelephonyCallStatus } from '@/lib/telephony/provider'
import type { NormalizedCallEvent, NormalizeProviderWebhookInput } from './types'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nullable(value: unknown): string | null {
  const result = text(value)
  return result || null
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function parsePayload(input: NormalizeProviderWebhookInput): Record<string, unknown> {
  if (/json/i.test(input.contentType)) {
    const parsed: unknown = input.rawBody ? JSON.parse(input.rawBody) : {}
    return objectValue(parsed)
  }
  return Object.fromEntries(new URLSearchParams(input.rawBody).entries())
}

function status(value: unknown): TelephonyCallStatus | null {
  const normalized = text(value).toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
  const map: Record<string, TelephonyCallStatus> = {
    idle: 'idle',
    validating: 'validating',
    queued: 'queued',
    initiated: 'ringing',
    initiating: 'initiating',
    ringing: 'ringing',
    answered: 'connected',
    active: 'connected',
    bridged: 'connected',
    'in-progress': 'connected',
    connected: 'connected',
    held: 'on-hold',
    'on-hold': 'on-hold',
    completed: 'completed',
    hangup: 'completed',
    hungup: 'completed',
    ended: 'completed',
    busy: 'failed',
    failed: 'failed',
    rejected: 'failed',
    timeout: 'failed',
    'no-answer': 'failed',
    canceled: 'cancelled',
    cancelled: 'cancelled',
  }
  return map[normalized] ?? null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  )
}

function eventId(provider: string, payload: Record<string, unknown>, parts: Array<unknown>): string {
  const direct =
    text(payload.id) ||
    text(payload.event_id) ||
    text(payload.EventUUID) ||
    text(payload.RequestUUID)
  if (direct) return direct

  const stablePayload = JSON.stringify(canonicalize(payload))
  return createHash('sha256')
    .update([provider, ...parts.map((part) => String(part ?? '')), stablePayload].join('|'))
    .digest('hex')
}

function normalizeTwilioCompatible(
  provider: 'twilio' | 'signalwire',
  payload: Record<string, unknown>,
  receivedAt: string,
): NormalizedCallEvent {
  const recordingId = nullable(payload.RecordingSid)
  const rawStatus = text(recordingId ? payload.RecordingStatus : payload.CallStatus) || 'unknown'
  const providerCallId = text(payload.CallSid) || text(payload.ParentCallSid)
  return {
    provider,
    eventId: eventId(provider, payload, [
      providerCallId,
      recordingId,
      rawStatus,
      payload.Timestamp,
      payload.SequenceNumber,
      payload.CallbackSource,
    ]),
    eventType: recordingId ? 'recording.status' : 'call.status',
    occurredAt: text(payload.Timestamp) || receivedAt,
    providerCallId,
    providerParentCallId: nullable(payload.ParentCallSid),
    providerRecordingId: recordingId,
    status: recordingId ? null : status(rawStatus),
    rawStatus,
    direction: /inbound/i.test(text(payload.Direction))
      ? 'inbound'
      : /outbound/i.test(text(payload.Direction))
        ? 'outbound'
        : null,
    fromNumber: nullable(payload.From),
    toNumber: nullable(payload.To),
    durationSeconds: numberValue(recordingId ? payload.RecordingDuration : payload.CallDuration),
    recordingUrl: nullable(payload.RecordingUrl),
    recordingChannels: numberValue(payload.RecordingChannels),
    metadata: {
      sequenceNumber: nullable(payload.SequenceNumber),
      callbackSource: nullable(payload.CallbackSource),
    },
    rawPayload: payload,
  }
}

function normalizeTelnyx(payload: Record<string, unknown>, receivedAt: string): NormalizedCallEvent {
  const wrapper = objectValue(payload.data)
  const eventType = text(wrapper.event_type || payload.event_type)
  const eventPayload = objectValue(wrapper.payload || payload.payload)
  const recording = /recording/i.test(eventType)
  const rawStatus = text(eventPayload.state || eventPayload.status || eventType) || 'unknown'
  const providerCallId = text(
    eventPayload.call_control_id || eventPayload.call_leg_id || eventPayload.call_session_id,
  )
  const recordingId = recording
    ? nullable(eventPayload.recording_id || eventPayload.recording_uuid)
    : null
  return {
    provider: 'telnyx',
    eventId:
      text(wrapper.id || payload.id) ||
      eventId('telnyx', payload, [eventType, providerCallId, recordingId]),
    eventType: recording ? 'recording.status' : 'call.status',
    occurredAt: text(wrapper.occurred_at || payload.occurred_at) || receivedAt,
    providerCallId,
    providerParentCallId: nullable(eventPayload.call_session_id),
    providerRecordingId: recordingId,
    status: recording ? null : status(rawStatus),
    rawStatus,
    direction: /incoming|inbound/i.test(text(eventPayload.direction))
      ? 'inbound'
      : /outgoing|outbound/i.test(text(eventPayload.direction))
        ? 'outbound'
        : null,
    fromNumber: nullable(eventPayload.from || eventPayload.from_number),
    toNumber: nullable(eventPayload.to || eventPayload.to_number),
    durationSeconds: numberValue(eventPayload.duration_secs || eventPayload.duration),
    recordingUrl: nullable(
      (eventPayload.recording_urls &&
        (objectValue(eventPayload.recording_urls).mp3 ||
          objectValue(eventPayload.recording_urls).wav)) ||
        (eventPayload.public_recording_urls &&
          (objectValue(eventPayload.public_recording_urls).mp3 ||
            objectValue(eventPayload.public_recording_urls).wav)) ||
        eventPayload.recording_url,
    ),
    recordingChannels:
      text(eventPayload.channels).toLowerCase() === 'dual'
        ? 2
        : text(eventPayload.channels).toLowerCase() === 'single'
          ? 1
          : numberValue(eventPayload.channels),
    metadata: { eventType, callLegId: nullable(eventPayload.call_leg_id) },
    rawPayload: payload,
  }
}

function normalizePlivo(payload: Record<string, unknown>, receivedAt: string): NormalizedCallEvent {
  const recordingId = nullable(payload.RecordingID || payload.RecordingUUID)
  const rawStatus = text(recordingId ? payload.RecordingStatus : payload.CallStatus || payload.Event) || 'unknown'
  const providerCallId = text(payload.CallUUID || payload.RequestUUID)
  return {
    provider: 'plivo',
    eventId: eventId('plivo', payload, [
      providerCallId,
      recordingId,
      rawStatus,
      payload.Event,
      payload.EventTime,
      payload.Timestamp,
    ]),
    eventType: recordingId ? 'recording.status' : 'call.status',
    occurredAt: text(payload.EventTime || payload.Timestamp) || receivedAt,
    providerCallId,
    providerParentCallId: nullable(payload.ParentAuthID || payload.ParentCallUUID),
    providerRecordingId: recordingId,
    status: recordingId ? null : status(rawStatus),
    rawStatus,
    direction: /inbound/i.test(text(payload.Direction))
      ? 'inbound'
      : /outbound/i.test(text(payload.Direction))
        ? 'outbound'
        : null,
    fromNumber: nullable(payload.From),
    toNumber: nullable(payload.To),
    durationSeconds: numberValue(payload.Duration || payload.RecordingDuration),
    recordingUrl: nullable(payload.RecordUrl || payload.RecordingUrl),
    recordingChannels: numberValue(payload.RecordingChannels),
    metadata: {
      event: nullable(payload.Event),
      hangupCause: nullable(payload.HangupCause),
      hangupCode: nullable(payload.HangupCauseCode),
    },
    rawPayload: payload,
  }
}

export function normalizeProviderWebhook(input: NormalizeProviderWebhookInput): NormalizedCallEvent {
  const receivedAt = input.receivedAt ?? new Date().toISOString()
  const payload = parsePayload(input)
  if (input.provider === 'twilio' || input.provider === 'signalwire') {
    return normalizeTwilioCompatible(input.provider, payload, receivedAt)
  }
  if (input.provider === 'telnyx') return normalizeTelnyx(payload, receivedAt)
  return normalizePlivo(payload, receivedAt)
}
