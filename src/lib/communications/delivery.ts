import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import { assertAutomationEnabled } from '@/lib/automation/operations'
import { enforceAutomationRules } from '@/lib/compliance/automation-rules'
import { sendGmailMessage } from '@/lib/integrations/google-client'
import { NonRetryableJobError, type JsonValue } from '@/lib/jobs/types'
import {
  getOrganizationActiveTelephonyProvider,
  getOrganizationProviderConnection,
} from '@/lib/telephony/provider-connections'
import type { ConfiguredTelephonyProviderName } from '@/lib/telephony/provider'

type CommunicationChannel = 'email' | 'sms'

type CommunicationMessage = {
  id: string
  organization_id: string
  contact_id: string | null
  channel: CommunicationChannel
  recipient: string
  sender: string | null
  subject: string | null
  body: string
  provider: string | null
  provider_message_id: string | null
  status: string
  attempt_count: number
  usage_consumed_at: string | null
  source:
    | 'manual'
    | 'sequence'
    | 'campaign'
    | 'api'
    | 'system'
    | 'post_call_email'
    | 'post_call_sms'
}

type ProviderResult = {
  provider: string
  messageId: string | null
  sender: string | null
}

class ProviderRequestError extends Error {
  readonly retryable: boolean
  readonly code: string

  constructor(message: string, options?: { retryable?: boolean; code?: string }) {
    super(message)
    this.name = 'ProviderRequestError'
    this.retryable = options?.retryable ?? true
    this.code = options?.code ?? 'PROVIDER_REQUEST_FAILED'
  }
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error('Missing Supabase service-role configuration.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError(
      'The communication job payload is invalid.',
      'INVALID_COMMUNICATION_PAYLOAD',
    )
  }
  return value as Record<string, JsonValue>
}

function requiredString(value: JsonValue | undefined, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NonRetryableJobError(
      `${label} is required.`,
      'INVALID_COMMUNICATION_PAYLOAD',
    )
  }
  return value.trim()
}

function requiredCredential(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ProviderRequestError(`${label} is unavailable.`, {
      retryable: false,
      code: 'PROVIDER_CONFIGURATION_ERROR',
    })
  }
  return value.trim()
}

function normalizeE164(value: string, label: string) {
  const normalized = value.trim()
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new NonRetryableJobError(
      `${label} must use E.164 format, for example +15551234567.`,
      'INVALID_PHONE_NUMBER',
    )
  }
  return normalized
}

async function readProviderResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

function providerErrorMessage(payload: Record<string, unknown>, fallback: string) {
  if (typeof payload.message === 'string') return payload.message
  if (typeof payload.error === 'string') return payload.error
  if (payload.error && typeof payload.error === 'object') {
    const error = payload.error as Record<string, unknown>
    if (typeof error.message === 'string') return error.message
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0]
    if (first && typeof first === 'object') {
      const error = first as Record<string, unknown>
      if (typeof error.detail === 'string') return error.detail
      if (typeof error.title === 'string') return error.title
    }
  }
  return fallback
}

async function assertProviderResponse(response: Response, fallback: string) {
  const payload = await readProviderResponse(response)
  if (!response.ok) {
    throw new ProviderRequestError(providerErrorMessage(payload, fallback), {
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      code: `PROVIDER_HTTP_${response.status}`,
    })
  }
  return payload
}

async function consumeMessageUsage(message: CommunicationMessage) {
  if (message.usage_consumed_at) return

  const client = createServiceClient()
  const { error } = await client.rpc('consume_organization_usage', {
    target_org: message.organization_id,
    usage_metric: message.channel === 'email' ? 'emails' : 'sms',
    usage_units: 1,
    usage_idempotency_key: `communication:${message.id}`,
  })

  if (error) {
    if (error.message.includes('USAGE_LIMIT_REACHED')) {
      throw new NonRetryableJobError(
        `The organization has reached its monthly ${message.channel} limit.`,
        'USAGE_LIMIT_REACHED',
      )
    }

    if (error.message.includes('SUBSCRIPTION_ACCESS_REQUIRED')) {
      throw new NonRetryableJobError(
        'The organization subscription does not currently allow communication usage.',
        'SUBSCRIPTION_ACCESS_REQUIRED',
      )
    }

    throw new Error(`Unable to consume communication usage: ${error.message}`)
  }

  const { error: updateError } = await client
    .from('communication_messages')
    .update({ usage_consumed_at: new Date().toISOString() })
    .eq('id', message.id)
    .eq('organization_id', message.organization_id)

  if (updateError) {
    throw new Error(`Unable to mark communication usage: ${updateError.message}`)
  }
}

async function sendEmail(message: CommunicationMessage): Promise<ProviderResult> {
  try {
    const gmail = await sendGmailMessage(message.organization_id, {
      to: message.recipient,
      subject: message.subject || 'Message from Flowtix',
      body: message.body,
    })
    return { provider: 'gmail', messageId: gmail.id, sender: gmail.sender }
  } catch (gmailError) {
    if (message.source === 'post_call_email') {
      throw gmailError
    }

    const apiKey = process.env.RESEND_API_KEY?.trim()
    const from = process.env.RESEND_FROM_EMAIL?.trim()
    if (!apiKey || !from) {
      throw gmailError
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.recipient],
        subject: message.subject || 'Message from Flowtix',
        html: message.body.replace(/\n/g, '<br>'),
      }),
      cache: 'no-store',
    })
    const payload = await assertProviderResponse(
      response,
      'The email provider rejected the message.',
    )
    return {
      provider: 'resend',
      messageId: typeof payload.id === 'string' ? payload.id : null,
      sender: from,
    }
  }
}

async function getSmsSender(
  organizationId: string,
  provider: ConfiguredTelephonyProviderName,
) {
  const client = createServiceClient()
  const { data, error } = await client
    .from('organization_phone_numbers')
    .select('phone_number,capabilities,is_default')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .order('is_default', { ascending: false })

  if (error) {
    throw new Error(`Unable to load an SMS sender: ${error.message}`)
  }

  const sender = (data ?? []).find((row) => {
    const capabilities = row.capabilities && typeof row.capabilities === 'object'
      ? row.capabilities as Record<string, unknown>
      : {}
    return capabilities.sms !== false
  })

  if (!sender?.phone_number) {
    throw new ProviderRequestError(
      `No SMS-capable ${provider} phone number is configured for this workspace.`,
      { retryable: false, code: 'SMS_SENDER_NOT_CONFIGURED' },
    )
  }

  return normalizeE164(sender.phone_number, 'SMS sender')
}


function communicationWebhookSecret() {
  const secret =
    process.env.COMMUNICATION_WEBHOOK_SECRET?.trim() ||
    process.env.INTERNAL_JOB_WORKER_SECRET?.trim()

  if (!secret) {
    throw new ProviderRequestError(
      'COMMUNICATION_WEBHOOK_SECRET or INTERNAL_JOB_WORKER_SECRET is required.',
      {
        retryable: false,
        code: 'COMMUNICATION_WEBHOOK_SECRET_MISSING',
      },
    )
  }

  return secret
}

function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (!configured) {
    throw new ProviderRequestError(
      'NEXT_PUBLIC_SITE_URL is required for delivery callbacks.',
      {
        retryable: false,
        code: 'SITE_URL_MISSING',
      },
    )
  }

  return configured.replace(/\/$/, '')
}

function deliveryCallbackToken(
  provider: ConfiguredTelephonyProviderName,
  messageId: string,
) {
  return createHmac('sha256', communicationWebhookSecret())
    .update(`${provider}:${messageId}`)
    .digest('base64url')
}

function deliveryCallbackUrl(
  provider: ConfiguredTelephonyProviderName,
  messageId: string,
) {
  const url = new URL(
    `/api/webhooks/communications/${provider}`,
    siteUrl(),
  )
  url.searchParams.set('messageId', messageId)
  url.searchParams.set(
    'token',
    deliveryCallbackToken(provider, messageId),
  )
  return url.toString()
}

async function sendSms(message: CommunicationMessage): Promise<ProviderResult> {
  const recipient = normalizeE164(message.recipient, 'SMS recipient')
  const provider = await getOrganizationActiveTelephonyProvider(message.organization_id)
  if (provider !== 'signalwire') {
    throw new ProviderRequestError('Flowtix messaging uses SignalWire only.', {
      retryable: false,
      code: 'PROVIDER_RETIRED',
    })
  }

  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    message.organization_id,
    'signalwire',
  )
  const sender = await getSmsSender(message.organization_id, 'signalwire')
  const statusCallback = deliveryCallbackUrl('signalwire', message.id)
  const projectId = requiredCredential(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = requiredCredential(connection.credentials.apiToken, 'SignalWire API Token')
  const rawSpaceUrl = requiredCredential(connection.config.space_url, 'SignalWire Space URL').replace(/\/$/, '')
  const spaceUrl = /^https?:\/\//i.test(rawSpaceUrl) ? rawSpaceUrl : `https://${rawSpaceUrl}`
  const response = await fetch(
    `${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: recipient,
        From: sender,
        Body: message.body,
        StatusCallback: statusCallback,
      }),
      cache: 'no-store',
    },
  )
  const payload = await assertProviderResponse(response, 'SignalWire rejected the SMS message.')
  return {
    provider: 'signalwire',
    messageId: typeof payload.sid === 'string' ? payload.sid : null,
    sender,
  }
}

export async function deliverCommunication(
  payloadValue: JsonValue,
): Promise<Record<string, JsonValue>> {
  const payload = asObject(payloadValue)
  const messageId = requiredString(payload.messageId, 'Communication message ID')
  const client = createServiceClient()

  const { data, error } = await client
    .from('communication_messages')
    .select(
      'id,organization_id,contact_id,channel,recipient,sender,subject,body,provider,provider_message_id,status,attempt_count,usage_consumed_at,source',
    )
    .eq('id', messageId)
    .maybeSingle()

  if (error) throw new Error(`Unable to load communication message: ${error.message}`)
  if (!data) {
    throw new NonRetryableJobError('The communication message no longer exists.', 'MESSAGE_NOT_FOUND')
  }

  const message = data as CommunicationMessage
  if (message.status === 'sent' || message.status === 'delivered') {
    return {
      replay: true,
      messageId: message.id,
      provider: message.provider,
      providerMessageId: message.provider_message_id,
      status: message.status,
    }
  }
  if (message.status === 'cancelled') {
    return { skipped: true, messageId: message.id, status: 'cancelled' }
  }

  await assertAutomationEnabled(
    message.organization_id,
    'communications',
  )

  if (message.attempt_count === 0) {
  await enforceAutomationRules({
    organizationId: message.organization_id,
    contactId: message.contact_id,
    channel: message.channel,
    source: message.source,
    recipient: message.recipient,
  })
}

  await consumeMessageUsage(message)

  const startedAt = new Date().toISOString()
  const { error: processingError } = await client
    .from('communication_messages')
    .update({
      status: 'processing',
      processing_started_at: startedAt,
      attempt_count: message.attempt_count + 1,
      last_attempt_at: startedAt,
      error_message: null,
    })
    .eq('id', message.id)
    .eq('organization_id', message.organization_id)

  if (processingError) {
    throw new Error(`Unable to mark communication processing: ${processingError.message}`)
  }

  try {
    const result = message.channel === 'email'
      ? await sendEmail(message)
      : await sendSms(message)
    const sentAt = new Date().toISOString()
    const { error: updateError } = await client
      .from('communication_messages')
      .update({
        sender: result.sender,
        provider: result.provider,
        provider_message_id: result.messageId,
        status: 'sent',
        sent_at: sentAt,
        processing_started_at: null,
        error_message: null,
      })
      .eq('id', message.id)
      .eq('organization_id', message.organization_id)

    if (updateError) {
      throw new Error(`Unable to save communication delivery: ${updateError.message}`)
    }

    const { error: timelineError } = await client
      .from('crm_timeline_events')
      .insert({
        organization_id: message.organization_id,
        contact_id: message.contact_id,
            event_type: 'activity',
    event_action: 'sent',
    event_key: `communication_messages:${message.id}:sent`,
    title: message.subject || 'Email sent',
    description: message.body,
    source_table: 'communication_messages',
    source_id: message.id,
    occurred_at: sentAt,
      })

    if (timelineError) {
      throw new Error(`Unable to create communication timeline event: ${timelineError.message}`)
    }

    return {
      messageId: message.id,
      provider: result.provider,
      providerMessageId: result.messageId,
      sender: result.sender,
      status: 'sent',
      sentAt,
    }
  } catch (deliveryError) {
    const retryable = deliveryError instanceof ProviderRequestError
      ? deliveryError.retryable
      : !(deliveryError instanceof NonRetryableJobError)
    const code = deliveryError instanceof ProviderRequestError
      ? deliveryError.code
      : deliveryError instanceof NonRetryableJobError
        ? deliveryError.code
        : 'COMMUNICATION_DELIVERY_FAILED'
    const messageText = deliveryError instanceof Error
      ? deliveryError.message
      : 'The provider request failed.'

    await client
      .from('communication_messages')
      .update({
        status: retryable ? 'queued' : 'failed',
        processing_started_at: null,
        error_message: messageText,
        last_error_code: code,
      })
      .eq('id', message.id)
      .eq('organization_id', message.organization_id)

    if (!retryable) {
      throw new NonRetryableJobError(messageText, code)
    }
    throw deliveryError
  }
}