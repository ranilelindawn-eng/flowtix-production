import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import type { ConfiguredTelephonyProviderName } from '@/lib/telephony/provider'

export type DeliveryProvider = ConfiguredTelephonyProviderName | 'resend'

type NormalizedDeliveryEvent = {
  eventId: string
  providerMessageId: string
  status: 'queued' | 'sent' | 'delivered' | 'delayed' | 'failed'
  eventAt: string
  errorCode: string | null
  errorMessage: string | null
  metadata: Record<string, string | number | boolean | null>
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Missing Supabase service-role configuration.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function webhookSecret() {
  const secret = process.env.COMMUNICATION_WEBHOOK_SECRET?.trim() || process.env.INTERNAL_JOB_WORKER_SECRET?.trim()
  if (!secret) throw new Error('COMMUNICATION_WEBHOOK_SECRET or INTERNAL_JOB_WORKER_SECRET is required.')
  return secret
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function expectedCallbackToken(provider: ConfiguredTelephonyProviderName, messageId: string) {
  return createHmac('sha256', webhookSecret()).update(`${provider}:${messageId}`).digest('base64url')
}

export function validateCallbackToken(input: { provider: ConfiguredTelephonyProviderName; messageId: string; token: string }) {
  return safeEqual(expectedCallbackToken(input.provider, input.messageId), input.token)
}

function hashEvent(...parts: string[]) {
  return createHmac('sha256', webhookSecret()).update(parts.join('|')).digest('hex')
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function eventTime(value: unknown) {
  const candidate = stringValue(value)
  if (!candidate) return new Date().toISOString()
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function mapSmsStatus(value: string | null) {
  switch ((value ?? '').toLowerCase()) {
    case 'accepted': case 'queued': case 'scheduled': case 'sending': case 'submitted': return 'queued' as const
    case 'sent': case 'in-progress': return 'sent' as const
    case 'delivered': case 'delivery_success': case 'read': return 'delivered' as const
    case 'delivery_delayed': case 'delayed': return 'delayed' as const
    case 'failed': case 'undelivered': case 'delivery_failed': case 'rejected': case 'expired': case 'canceled': case 'cancelled': return 'failed' as const
    default: return 'sent' as const
  }
}

export function normalizeFormDeliveryEvent(provider: ConfiguredTelephonyProviderName, form: URLSearchParams): NormalizedDeliveryEvent {
  const providerMessageId = form.get('MessageSid') || form.get('MessageUUID') || form.get('MessageUuid') || form.get('message_uuid') || ''
  if (!providerMessageId) throw new Error('The provider message ID is missing.')
  const providerStatus = form.get('MessageStatus') || form.get('Status') || form.get('status') || form.get('MessageState')
  const errorCode = form.get('ErrorCode') || form.get('Error') || form.get('error_code')
  const errorMessage = form.get('ErrorMessage') || form.get('error_message') || form.get('Description')
  const eventAt = eventTime(form.get('Timestamp') || form.get('EventTimestamp') || form.get('message_time'))
  return {
    eventId: form.get('EventSid') || form.get('event_id') || hashEvent(provider, providerMessageId, providerStatus ?? '', errorCode ?? '', eventAt),
    providerMessageId,
    status: mapSmsStatus(providerStatus),
    eventAt,
    errorCode,
    errorMessage,
    metadata: { providerStatus, from: form.get('From') || form.get('FromNumber'), to: form.get('To') || form.get('ToNumber') },
  }
}

export function normalizeResendDeliveryEvent(body: Record<string, unknown>, eventId: string): NormalizedDeliveryEvent {
  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data as Record<string, unknown> : {}
  const type = stringValue(body.type)
  const providerMessageId = stringValue(data.email_id)
  if (!type || !providerMessageId) throw new Error('The Resend delivery event is invalid.')
  let status: NormalizedDeliveryEvent['status'] = 'sent'
  if (type === 'email.delivered') status = 'delivered'
  else if (type === 'email.delivery_delayed') status = 'delayed'
  else if (type === 'email.failed' || type === 'email.bounced' || type === 'email.complained') status = 'failed'
  const bounce = data.bounce && typeof data.bounce === 'object' && !Array.isArray(data.bounce) ? data.bounce as Record<string, unknown> : null
  return {
    eventId,
    providerMessageId,
    status,
    eventAt: eventTime(body.created_at || data.created_at),
    errorCode: type === 'email.bounced' ? stringValue(bounce?.type) || 'BOUNCED' : type === 'email.complained' ? 'COMPLAINED' : type === 'email.failed' ? 'FAILED' : null,
    errorMessage: stringValue(bounce?.message) || (status === 'failed' ? type : null),
    metadata: { type },
  }
}

export function validateResendSignature(input: { rawBody: string; eventId: string; timestamp: string; signatureHeader: string }) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret || !input.eventId || !input.timestamp || !input.signatureHeader) return false
  const keyValue = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let key: Buffer
  try { key = Buffer.from(keyValue, 'base64') } catch { return false }
  const expected = createHmac('sha256', key).update(`${input.eventId}.${input.timestamp}.${input.rawBody}`).digest('base64')
  return input.signatureHeader.split(' ').some((candidate) => {
    const [, signature] = candidate.split(',')
    return signature ? safeEqual(expected, signature) : false
  })
}

export async function findCommunicationMessage(input: { messageId?: string | null; provider: DeliveryProvider; providerMessageId: string }) {
  const client = adminClient()
  let query = client.from('communication_messages').select('id,organization_id,provider,provider_message_id')
  if (input.messageId) query = query.eq('id', input.messageId)
  else query = query.eq('provider', input.provider).eq('provider_message_id', input.providerMessageId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Unable to find communication message: ${error.message}`)
  return data as { id: string; organization_id: string; provider: string | null; provider_message_id: string | null } | null
}

export async function applyDeliveryEvent(input: { provider: DeliveryProvider; messageId: string | null; event: NormalizedDeliveryEvent }) {
  const client = adminClient()
  const { data, error } = await client.rpc('apply_communication_delivery_event', {
    p_provider: input.provider,
    p_event_id: input.event.eventId,
    p_message_id: input.messageId,
    p_provider_message_id: input.event.providerMessageId,
    p_provider_status: input.event.metadata.providerStatus ?? input.event.metadata.type ?? input.event.status,
    p_normalized_status: input.event.status,
    p_event_at: input.event.eventAt,
    p_error_code: input.event.errorCode,
    p_error_message: input.event.errorMessage,
    p_metadata: input.event.metadata,
  })
  if (error) throw new Error(`Unable to apply communication delivery event: ${error.message}`)
  return data
}
