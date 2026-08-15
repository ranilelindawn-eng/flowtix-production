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
    idle: 'idle', validating: 'validating', queued: 'queued', initiated: 'ringing',
    initiating: 'initiating', ringing: 'ringing', answered: 'connected', active: 'connected',
    bridged: 'connected', 'in-progress': 'connected', connected: 'connected', held: 'on-hold',
    'on-hold': 'on-hold', completed: 'completed', hangup: 'completed', hungup: 'completed',
    ended: 'completed', busy: 'failed', failed: 'failed', rejected: 'failed', timeout: 'failed',
    'no-answer': 'failed', canceled: 'cancelled', cancelled: 'cancelled',
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

function eventId(payload: Record<string, unknown>, parts: Array<unknown>): string {
  const direct = text(payload.id) || text(payload.event_id) || text(payload.EventUUID) || text(payload.RequestUUID)
  if (direct) return direct
  return createHash('sha256')
    .update(['signalwire', ...parts.map((part) => String(part ?? '')), JSON.stringify(canonicalize(payload))].join('|'))
    .digest('hex')
}

export function normalizeProviderWebhook(input: NormalizeProviderWebhookInput): NormalizedCallEvent {
  const receivedAt = input.receivedAt ?? new Date().toISOString()
  const payload = parsePayload(input)
  const recordingId = nullable(payload.RecordingSid)
  const rawStatus = text(recordingId ? payload.RecordingStatus : payload.CallStatus) || 'unknown'
  const providerCallId = text(payload.CallSid) || text(payload.ParentCallSid)

  return {
    provider: 'signalwire',
    eventId: eventId(payload, [
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
