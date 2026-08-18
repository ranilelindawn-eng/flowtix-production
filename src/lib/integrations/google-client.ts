import { createClient } from '@supabase/supabase-js'
import { decryptIntegrationSecret, encryptIntegrationSecret } from './crypto'

type GoogleCredentials = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
  tokenType?: string
}

type IntegrationRecord = {
  id: string
  provider: 'gmail' | 'google-calendar'
  organization_id: string
  enabled: boolean
  status: string
  config: Record<string, unknown> | null
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Missing Supabase service role configuration.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} environment variable.`)
  return value
}

async function refreshGoogleToken(credentials: GoogleCredentials) {
  if (!credentials.refreshToken) throw new Error('Google refresh token is unavailable. Reconnect the integration.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('GOOGLE_CLIENT_ID'),
      client_secret: required('GOOGLE_CLIENT_SECRET'),
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const payload = await response.json() as { access_token?: string; expires_in?: number; scope?: string; token_type?: string; error_description?: string }
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Google token refresh failed.')
  return {
    ...credentials,
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
    scope: payload.scope ?? credentials.scope,
    tokenType: payload.token_type ?? credentials.tokenType,
  }
}

export async function getGoogleConnection(organizationId: string, provider: 'gmail' | 'google-calendar') {
  const admin = adminClient()
  const { data: integration, error } = await admin.from('organization_integrations')
    .select('id,provider,organization_id,enabled,status,config')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const record = integration as IntegrationRecord | null
  if (!record || !record.enabled || record.status !== 'connected') throw new Error(`${provider} is not connected for this organization.`)

  const { data: secret, error: secretError } = await admin.from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('integration_id', record.id)
    .eq('organization_id', organizationId)
    .single()
  if (secretError || !secret) throw new Error(secretError?.message || 'Integration credentials are unavailable.')

  let credentials = decryptIntegrationSecret<GoogleCredentials>(secret.encrypted_credentials)
  const expiresAt = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : 0
  if (!credentials.accessToken || expiresAt <= Date.now() + 60_000) {
    credentials = await refreshGoogleToken(credentials)
    const { error: updateError } = await admin.from('organization_integration_secrets')
      .update({ encrypted_credentials: encryptIntegrationSecret(credentials), updated_at: new Date().toISOString() })
      .eq('integration_id', record.id)
    if (updateError) throw new Error(updateError.message)
  }

  return { integration: record, accessToken: credentials.accessToken }
}

export async function updateIntegrationHealth(
  organizationId: string,
  provider: 'gmail' | 'google-calendar',
  result: { ok: boolean; message?: string },
) {
  const admin = adminClient()
  const now = new Date().toISOString()
  const { data } = await admin.from('organization_integrations')
    .select('config').eq('organization_id', organizationId).eq('provider', provider).maybeSingle()
  const config = (data?.config && typeof data.config === 'object') ? data.config as Record<string, unknown> : {}
  await admin.from('organization_integrations').update({
    last_error: result.ok ? null : result.message ?? 'Connection test failed.',
    last_tested_at: now,
    last_test_status: result.ok ? 'passed' : 'failed',
    config: { ...config, last_verified_at: now },
    updated_at: now,
  }).eq('organization_id', organizationId).eq('provider', provider)
}

function safeMailHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export async function sendGmailMessage(
  organizationId: string,
  input: {
    to: string
    subject: string
    body: string
    threadId?: string | null
    inReplyTo?: string | null
    references?: string | null
  },
) {
  const { accessToken, integration } = await getGoogleConnection(organizationId, 'gmail')
  const connectedEmail = typeof integration.config?.connected_email === 'string' ? integration.config.connected_email : undefined
  const headers = [
    `From: ${safeMailHeader(connectedEmail ?? 'me')}`,
    `To: ${safeMailHeader(input.to)}`,
    `Subject: ${safeMailHeader(input.subject)}`,
  ]

  if (input.inReplyTo?.trim()) {
    headers.push(`In-Reply-To: ${safeMailHeader(input.inReplyTo)}`)
  }
  if (input.references?.trim()) {
    headers.push(`References: ${safeMailHeader(input.references)}`)
  }

  const raw = [
    ...headers,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    input.body.replace(/\n/g, '<br>'),
  ].join('\r\n')
  const encoded = Buffer.from(raw, 'utf8').toString('base64url')
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw: encoded,
      ...(input.threadId?.trim() ? { threadId: input.threadId.trim() } : {}),
    }),
    cache: 'no-store',
  })
  const payload = await response.json() as { id?: string; threadId?: string; error?: { message?: string } }
  if (!response.ok || !payload.id) throw new Error(payload.error?.message || 'Gmail rejected the message.')

  // Gmail's send response contains its API message/thread IDs but not the RFC
  // Message-ID header needed for reliable future In-Reply-To/References headers.
  // Read that header back best-effort; a metadata lookup failure must never turn
  // an already-successful send into a failed delivery.
  let internetMessageId: string | null = null
  try {
    const metadataUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.id)}`,
    )
    metadataUrl.searchParams.set('format', 'metadata')
    metadataUrl.searchParams.append('metadataHeaders', 'Message-ID')
    const metadataResponse = await fetch(metadataUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (metadataResponse.ok) {
      const metadata = await metadataResponse.json() as {
        payload?: { headers?: Array<{ name?: string; value?: string }> }
      }
      internetMessageId = metadata.payload?.headers
        ?.find((header) => header.name?.toLowerCase() === 'message-id')
        ?.value?.trim() || null
    }
  } catch {
    internetMessageId = null
  }

  return {
    id: payload.id,
    threadId: payload.threadId ?? input.threadId ?? null,
    internetMessageId,
    sender: connectedEmail ?? null,
  }
}

export async function createGoogleCalendarEvent(organizationId: string, input: { summary: string; description?: string; start: Date; end: Date }) {
  const { accessToken } = await getGoogleConnection(organizationId, 'google-calendar')
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    }),
    cache: 'no-store',
  })
  const payload = await response.json() as { id?: string; htmlLink?: string; error?: { message?: string } }
  if (!response.ok || !payload.id) throw new Error(payload.error?.message || 'Google Calendar rejected the event.')
  return payload
}
