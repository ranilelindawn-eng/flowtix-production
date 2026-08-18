import { Buffer } from 'node:buffer'
import { createClient } from '@supabase/supabase-js'

import { getGoogleConnection } from '@/lib/integrations/google-client'
import { NonRetryableJobError, type JsonValue } from '@/lib/jobs/types'

type GmailHeader = { name?: string; value?: string }
type GmailPart = {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
type GmailMessage = {
  id?: string
  threadId?: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPart
  error?: { message?: string }
}
type GmailHistoryResponse = {
  history?: Array<{
    id?: string
    messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }>
  }>
  historyId?: string
  nextPageToken?: string
  error?: { message?: string }
}

type GmailListResponse = {
  messages?: Array<{ id?: string; threadId?: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
  error?: { message?: string }
}

type IntegrationRecord = {
  id: string
  organization_id: string
  enabled: boolean
  status: string
  config: Record<string, unknown> | null
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error('Missing Supabase service-role configuration for Gmail inbox synchronization.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError('The Gmail job payload is invalid.', 'INVALID_GMAIL_JOB_PAYLOAD')
  }
  return value as Record<string, JsonValue>
}

function requiredOrganizationId(value: JsonValue | undefined) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NonRetryableJobError('Gmail organization ID is required.', 'INVALID_GMAIL_JOB_PAYLOAD')
  }
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function decodeBase64Url(value: string) {
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return ''
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function htmlToText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function partBody(part: GmailPart | undefined, mimeType: string): string | null {
  if (!part) return null

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data)
  }

  for (const child of part.parts ?? []) {
    const found = partBody(child, mimeType)
    if (found) return found
  }

  return null
}

function extractMessageBody(payload: GmailPart | undefined) {
  const plain = partBody(payload, 'text/plain')
  if (plain?.trim()) return plain.replace(/\r/g, '').trim().slice(0, 100_000)

  const html = partBody(payload, 'text/html')
  if (html?.trim()) return htmlToText(html).slice(0, 100_000)

  if (payload?.body?.data) {
    const fallback = decodeBase64Url(payload.body.data)
    return (payload.mimeType === 'text/html' ? htmlToText(fallback) : fallback)
      .replace(/\r/g, '')
      .trim()
      .slice(0, 100_000)
  }

  return ''
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  const wanted = name.toLowerCase()
  return optionalString(headers?.find((header) => header.name?.toLowerCase() === wanted)?.value)
}

function parseEmailAddress(value: string | null) {
  if (!value) return null
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  if (angle?.[1]) return angle[1].trim().toLowerCase()
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0]?.trim().toLowerCase() ?? null
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

function messageTimestamp(internalDate: string | undefined) {
  const millis = Number(internalDate)
  if (Number.isFinite(millis) && millis > 0) {
    return new Date(millis).toISOString()
  }
  return new Date().toISOString()
}

async function updateIntegrationConfig(
  organizationId: string,
  patch: Record<string, unknown>,
) {
  const admin = serviceClient()
  const { error } = await admin.rpc(
    'merge_gmail_communication_integration_config',
    {
      p_organization_id: organizationId,
      p_patch: patch,
    },
  )

  if (error) {
    throw new Error(`Unable to save Gmail inbox state: ${error.message}`)
  }
}

async function gmailJson<T>(
  organizationId: string,
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; payload: T }> {
  const { accessToken } = await getGoogleConnection(organizationId, 'gmail')
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  const payload = await response.json() as T
  return { response, payload }
}

export async function renewGmailInboxWatch(payloadValue: JsonValue) {
  const payload = asObject(payloadValue)
  const organizationId = requiredOrganizationId(payload.organizationId)
  const topicName = process.env.GMAIL_PUBSUB_TOPIC?.trim()

  if (!topicName) {
    await updateIntegrationConfig(organizationId, {
      gmail_watch_status: 'not_configured',
      gmail_watch_error: 'GMAIL_PUBSUB_TOPIC is not configured.',
      gmail_watch_updated_at: new Date().toISOString(),
    })
    return { configured: false, organizationId }
  }

  try {
    const { response, payload: watch } = await gmailJson<{
      historyId?: string
      expiration?: string
      error?: { message?: string }
    }>(
      organizationId,
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        body: JSON.stringify({
          topicName,
          labelIds: ['INBOX'],
        }),
      },
    )

    if (!response.ok || !watch.historyId || !watch.expiration) {
      throw new Error(watch.error?.message || 'Gmail rejected the inbox watch request.')
    }

    const expirationMillis = Number(watch.expiration)
    const expiration = Number.isFinite(expirationMillis)
      ? new Date(expirationMillis).toISOString()
      : null

    await updateIntegrationConfig(organizationId, {
      gmail_watch_status: 'active',
      gmail_watch_error: null,
      gmail_watch_history_id: watch.historyId,
      gmail_watch_expiration: expiration,
      gmail_watch_updated_at: new Date().toISOString(),
    })

    return {
      configured: true,
      organizationId,
      historyId: watch.historyId,
      expiration,
    }
  } catch (error) {
    await updateIntegrationConfig(organizationId, {
      gmail_watch_status: 'error',
      gmail_watch_error: error instanceof Error ? error.message : 'Gmail watch failed.',
      gmail_watch_updated_at: new Date().toISOString(),
    })
    throw error
  }
}

async function getGmailIntegration(organizationId: string): Promise<IntegrationRecord> {
  const admin = serviceClient()
  const { data, error } = await admin
    .from('organization_integrations')
    .select('id,organization_id,enabled,status,config')
    .eq('organization_id', organizationId)
    .eq('provider', 'gmail')
    .maybeSingle()

  if (error) throw new Error(`Unable to load Gmail integration: ${error.message}`)
  if (!data || !data.enabled || data.status !== 'connected') {
    throw new NonRetryableJobError('Gmail is not connected for this organization.', 'GMAIL_NOT_CONNECTED')
  }
  return data as IntegrationRecord
}

async function fetchGmailMessage(organizationId: string, messageId: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`)
  url.searchParams.set('format', 'full')
  const { response, payload } = await gmailJson<GmailMessage>(organizationId, url.toString())
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Unable to read Gmail message ${messageId}.`)
  }
  return payload
}

async function findContactByEmail(organizationId: string, email: string) {
  const admin = serviceClient()
  const { data, error } = await admin
    .from('contacts')
    .select('id,company_id')
    .eq('organization_id', organizationId)
    .is('merged_into_contact_id', null)
    .ilike('email', escapeLikePattern(email))
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Unable to match Gmail sender to a contact: ${error.message}`)
  return data as { id: string; company_id: string | null } | null
}

async function findExistingEmailConversation(
  organizationId: string,
  senderEmail: string,
  threadId: string | undefined,
) {
  const admin = serviceClient()

  if (threadId?.trim()) {
    const { data, error } = await admin
      .from('communication_messages')
      .select('conversation_id')
      .eq('organization_id', organizationId)
      .eq('channel', 'email')
      .eq('provider_thread_id', threadId.trim())
      .not('conversation_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`Unable to match Gmail thread to a Flowtix conversation: ${error.message}`)
    }
    if (data?.conversation_id) return String(data.conversation_id)
  }

  const { data, error } = await admin
    .from('communication_messages')
    .select('conversation_id')
    .eq('organization_id', organizationId)
    .eq('channel', 'email')
    .eq('direction', 'outbound')
    .ilike('recipient', escapeLikePattern(senderEmail))
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to match Gmail sender to a Flowtix conversation: ${error.message}`)
  }

  return data?.conversation_id ? String(data.conversation_id) : null
}

async function storeInboundGmailMessage(
  organizationId: string,
  connectedEmail: string,
  gmailMessage: GmailMessage,
) {
  if (!gmailMessage.id) return false
  const headers = gmailMessage.payload?.headers
  const fromHeader = headerValue(headers, 'From')
  const senderEmail = parseEmailAddress(fromHeader)
  if (!senderEmail || senderEmail === connectedEmail.toLowerCase()) return false

  const admin = serviceClient()
  const { data: existing, error: existingError } = await admin
    .from('communication_messages')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('provider', 'gmail')
    .eq('provider_message_id', gmailMessage.id)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Unable to check Gmail message idempotency: ${existingError.message}`)
  }
  if (existing) return false

  const contact = await findContactByEmail(organizationId, senderEmail)
  const existingConversationId = await findExistingEmailConversation(
    organizationId,
    senderEmail,
    gmailMessage.threadId,
  )

  // Flowtix is a CRM inbox, not a mirror of the user's entire Gmail mailbox.
  // Store only messages that belong to a CRM contact or an existing Flowtix thread.
  if (!contact && !existingConversationId) return false

  let conversationContact: { contact_id: string | null; company_id: string | null } | null = null
  if (existingConversationId) {
    const { data, error } = await admin
      .from('communication_conversations')
      .select('contact_id,company_id')
      .eq('organization_id', organizationId)
      .eq('id', existingConversationId)
      .maybeSingle()

    if (error) {
      throw new Error(`Unable to load the matched Gmail conversation: ${error.message}`)
    }
    conversationContact = data
  }

  const contactId = conversationContact?.contact_id ?? contact?.id ?? null
  const companyId = conversationContact?.company_id ?? contact?.company_id ?? null
  const subject = headerValue(headers, 'Subject')
  const internetMessageId = headerValue(headers, 'Message-ID')
  const inReplyTo = headerValue(headers, 'In-Reply-To')
  const referencesHeader = headerValue(headers, 'References')
  const receivedAt = messageTimestamp(gmailMessage.internalDate)
  const body = extractMessageBody(gmailMessage.payload) || '(No text content)'

  const { error: insertError } = await admin
    .from('communication_messages')
    .insert({
      organization_id: organizationId,
      conversation_id: existingConversationId,
      contact_id: contactId,
      company_id: companyId,
      channel: 'email',
      direction: 'inbound',
      recipient: connectedEmail,
      sender: senderEmail,
      subject,
      body,
      provider: 'gmail',
      provider_message_id: gmailMessage.id,
      provider_thread_id: gmailMessage.threadId ?? null,
      internet_message_id: internetMessageId,
      in_reply_to: inReplyTo,
      references_header: referencesHeader,
      status: 'received',
      source: 'api',
      sent_by: null,
      sent_at: receivedAt,
      received_at: receivedAt,
    })

  if (insertError) {
    if (insertError.code === '23505') return false
    throw new Error(`Unable to store inbound Gmail message: ${insertError.message}`)
  }

  return true
}

async function initialInboxMessageIds(organizationId: string) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('labelIds', 'INBOX')
  url.searchParams.set('q', 'newer_than:14d')
  url.searchParams.set('maxResults', '100')

  const { response, payload } = await gmailJson<GmailListResponse>(organizationId, url.toString())
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Unable to list recent Gmail inbox messages.')
  }
  return (payload.messages ?? []).flatMap((message) => message.id ? [message.id] : [])
}

async function currentGmailHistoryId(organizationId: string) {
  const { response, payload } = await gmailJson<{ historyId?: string; error?: { message?: string } }>(
    organizationId,
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
  )
  if (!response.ok || !payload.historyId) {
    throw new Error(payload.error?.message || 'Unable to read Gmail mailbox history ID.')
  }
  return payload.historyId
}

async function historyMessageIds(organizationId: string, startHistoryId: string) {
  const ids = new Set<string>()
  let pageToken: string | null = null
  let latestHistoryId: string | null = null

  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history')
    url.searchParams.set('startHistoryId', startHistoryId)
    url.searchParams.set('historyTypes', 'messageAdded')
    url.searchParams.set('labelId', 'INBOX')
    url.searchParams.set('maxResults', '500')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const { response, payload } = await gmailJson<GmailHistoryResponse>(organizationId, url.toString())
    if (response.status === 404) {
      return { expired: true, ids: [] as string[], historyId: null as string | null }
    }
    if (!response.ok) {
      throw new Error(payload.error?.message || 'Unable to read Gmail mailbox history.')
    }

    for (const history of payload.history ?? []) {
      for (const added of history.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id)
      }
    }

    latestHistoryId = payload.historyId ?? latestHistoryId
    pageToken = payload.nextPageToken ?? null
  } while (pageToken)

  return { expired: false, ids: [...ids], historyId: latestHistoryId }
}

export async function syncGmailInbox(payloadValue: JsonValue) {
  const payload = asObject(payloadValue)
  const organizationId = requiredOrganizationId(payload.organizationId)
  const pushedHistoryId = optionalString(payload.historyId)
  const integration = await getGmailIntegration(organizationId)
  const config = configObject(integration.config)
  const connectedEmail = optionalString(config.connected_email)?.toLowerCase()

  if (!connectedEmail) {
    throw new NonRetryableJobError('The connected Gmail address is unavailable.', 'GMAIL_CONNECTED_EMAIL_MISSING')
  }

  const syncHistoryId = optionalString(config.gmail_sync_history_id)
    ?? optionalString(config.gmail_watch_history_id)

  let messageIds: string[] = []
  let nextHistoryId = pushedHistoryId

  if (syncHistoryId) {
    const history = await historyMessageIds(organizationId, syncHistoryId)
    if (history.expired) {
      messageIds = await initialInboxMessageIds(organizationId)
      nextHistoryId = await currentGmailHistoryId(organizationId)
    } else {
      messageIds = history.ids
      nextHistoryId = history.historyId ?? pushedHistoryId ?? syncHistoryId
    }
  } else {
    messageIds = await initialInboxMessageIds(organizationId)
    nextHistoryId = await currentGmailHistoryId(organizationId)
  }

  let stored = 0
  for (const messageId of messageIds) {
    const message = await fetchGmailMessage(organizationId, messageId)
    if (await storeInboundGmailMessage(organizationId, connectedEmail, message)) {
      stored += 1
    }
  }

  await updateIntegrationConfig(organizationId, {
    gmail_sync_history_id: nextHistoryId,
    gmail_last_sync_at: new Date().toISOString(),
    gmail_last_sync_error: null,
  })

  return {
    organizationId,
    scanned: messageIds.length,
    stored,
    historyId: nextHistoryId,
  }
}

export async function resolveGmailOrganization(emailAddress: string) {
  const email = emailAddress.trim().toLowerCase()
  if (!email) return null

  const admin = serviceClient()
  const { data, error } = await admin.rpc(
    'resolve_gmail_communication_organizations',
    { p_email: email },
  )

  if (error) {
    throw new Error(`Unable to resolve Gmail tenant: ${error.message}`)
  }

  const rows = data ?? []
  if (rows.length !== 1) {
    if (rows.length > 1) {
      console.error('Gmail push could not be routed because the address is connected to multiple organizations.', { email })
    }
    return null
  }

  return String(rows[0].organization_id)
}

export async function enqueueGmailSync(input: {
  organizationId: string
  historyId: string
}) {
  const admin = serviceClient()
  const now = new Date().toISOString()
  const idempotencyKey = `gmail-sync:${input.organizationId}:${input.historyId}`

  const { error } = await admin
    .from('background_jobs')
    .upsert(
      {
        organization_id: input.organizationId,
        queue: 'communications',
        job_type: 'communications.gmail_sync',
        payload: {
          organizationId: input.organizationId,
          historyId: input.historyId,
        },
        status: 'queued',
        priority: 55,
        scheduled_at: now,
        max_attempts: 6,
        idempotency_key: idempotencyKey,
        created_by: null,
      },
      {
        onConflict: 'organization_id,idempotency_key',
        ignoreDuplicates: true,
      },
    )

  if (error) {
    throw new Error(`Unable to enqueue Gmail synchronization: ${error.message}`)
  }
}
