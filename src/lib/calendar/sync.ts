import { createClient } from '@supabase/supabase-js'

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '@/lib/integrations/crypto'
import {
  NonRetryableJobError,
  type JsonValue,
} from '@/lib/jobs/types'

type CalendarSyncProvider =
  | 'google-calendar'
  | 'outlook'

type CalendarSyncAction =
  | 'upsert'
  | 'delete'

type CalendarSyncPayload = {
  eventId: string
  organizationId: string
  revision: number
  action: CalendarSyncAction
}

type CalendarEventRecord = {
  id: string
  organization_id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  timezone: string
  all_day: boolean
  location: string | null
  attendee_emails: string[]
  meeting_url: string | null
  calendar_sync_provider: CalendarSyncProvider | 'none'
  calendar_sync_revision: number
  calendar_sync_status: string
  external_calendar_event_id: string | null
  external_calendar_event_url: string | null
  external_calendar_etag: string | null
  deleted_at: string | null
}

type OAuthCredentials = {
  accessToken?: string
  refreshToken?: string
  access_token?: string
  refresh_token?: string
  expiresAt?: string
  expires_in?: number
  scope?: string
  tokenType?: string
  token_type?: string
}

type IntegrationRecord = {
  id: string
  provider: string
  enabled: boolean
  status: string
  config: Record<string, unknown>
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for calendar synchronization.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function requiredString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new NonRetryableJobError(
      `${label} is required.`,
      'INVALID_CALENDAR_SYNC_PAYLOAD',
    )
  }

  return value.trim()
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  const number = Number(value)

  if (!Number.isInteger(number) || number < 1) {
    throw new NonRetryableJobError(
      `${label} must be a positive integer.`,
      'INVALID_CALENDAR_SYNC_PAYLOAD',
    )
  }

  return number
}

function parsePayload(
  value: JsonValue,
): CalendarSyncPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NonRetryableJobError(
      'Calendar sync payload must be an object.',
      'INVALID_CALENDAR_SYNC_PAYLOAD',
    )
  }

  const record = value as Record<string, JsonValue>
  const action = requiredString(
    record.action,
    'Calendar sync action',
  )

  if (action !== 'upsert' && action !== 'delete') {
    throw new NonRetryableJobError(
      'Calendar sync action is unsupported.',
      'INVALID_CALENDAR_SYNC_ACTION',
    )
  }

  return {
    eventId: requiredString(
      record.eventId,
      'Calendar event ID',
    ),
    organizationId: requiredString(
      record.organizationId,
      'Organization ID',
    ),
    revision: positiveInteger(
      record.revision,
      'Calendar sync revision',
    ),
    action,
  }
}

function accessToken(credentials: OAuthCredentials) {
  return (
    credentials.accessToken ??
    credentials.access_token ??
    ''
  ).trim()
}

function refreshToken(credentials: OAuthCredentials) {
  return (
    credentials.refreshToken ??
    credentials.refresh_token ??
    ''
  ).trim()
}

function expiresAt(credentials: OAuthCredentials) {
  const value = credentials.expiresAt

  if (!value) {
    return 0
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

async function readJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}

async function refreshGoogleCredentials(
  credentials: OAuthCredentials,
) {
  const token = refreshToken(credentials)
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET?.trim()

  if (!token || !clientId || !clientSecret) {
    throw new NonRetryableJobError(
      'Google Calendar must be reconnected.',
      'GOOGLE_REAUTH_REQUIRED',
    )
  }

  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    },
  )

  const payload = await readJson(response)

  if (
    !response.ok ||
    typeof payload.access_token !== 'string'
  ) {
    throw new Error(
      typeof payload.error_description === 'string'
        ? payload.error_description
        : 'Google Calendar token refresh failed.',
    )
  }

  return {
    ...credentials,
    accessToken: payload.access_token,
    access_token: payload.access_token,
    expiresAt: new Date(
      Date.now() +
        (typeof payload.expires_in === 'number'
          ? payload.expires_in
          : 3600) *
          1000,
    ).toISOString(),
    scope:
      typeof payload.scope === 'string'
        ? payload.scope
        : credentials.scope,
  }
}

async function refreshMicrosoftCredentials(
  credentials: OAuthCredentials,
) {
  const token = refreshToken(credentials)
  const clientId =
    process.env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret =
    process.env.MICROSOFT_CLIENT_SECRET?.trim()
  const tenant =
    process.env.MICROSOFT_TENANT_ID?.trim() ||
    'common'

  if (!token || !clientId || !clientSecret) {
    throw new NonRetryableJobError(
      'Microsoft Outlook must be reconnected.',
      'MICROSOFT_REAUTH_REQUIRED',
    )
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token,
        grant_type: 'refresh_token',
        scope: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'User.Read',
          'Calendars.ReadWrite',
        ].join(' '),
      }),
      cache: 'no-store',
    },
  )

  const payload = await readJson(response)

  if (
    !response.ok ||
    typeof payload.access_token !== 'string'
  ) {
    throw new Error(
      typeof payload.error_description === 'string'
        ? payload.error_description
        : 'Microsoft Outlook token refresh failed.',
    )
  }

  const rotatedRefreshToken =
    typeof payload.refresh_token === 'string'
      ? payload.refresh_token
      : token

  return {
    ...credentials,
    accessToken: payload.access_token,
    access_token: payload.access_token,
    refreshToken: rotatedRefreshToken,
    refresh_token: rotatedRefreshToken,
    expiresAt: new Date(
      Date.now() +
        (typeof payload.expires_in === 'number'
          ? payload.expires_in
          : 3600) *
          1000,
    ).toISOString(),
    scope:
      typeof payload.scope === 'string'
        ? payload.scope
        : credentials.scope,
  }
}

async function getConnection(
  organizationId: string,
  provider: CalendarSyncProvider,
) {
  const client = serviceClient()

  const { data: integration, error } = await client
    .from('organization_integrations')
    .select('id,provider,enabled,status,config')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load calendar integration: ${error.message}`,
    )
  }

  if (
    !integration ||
    !integration.enabled ||
    integration.status !== 'connected'
  ) {
    throw new NonRetryableJobError(
      `${provider} is not connected for this organization.`,
      'CALENDAR_INTEGRATION_NOT_CONNECTED',
    )
  }

  const record = integration as IntegrationRecord
  const { data: secret, error: secretError } = await client
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', organizationId)
    .eq('integration_id', record.id)
    .single()

  if (secretError || !secret) {
    throw new NonRetryableJobError(
      'Calendar integration credentials are unavailable.',
      'CALENDAR_CREDENTIALS_MISSING',
    )
  }

  let credentials =
    decryptIntegrationSecret<OAuthCredentials>(
      secret.encrypted_credentials,
    )

  if (
    !accessToken(credentials) ||
    expiresAt(credentials) <= Date.now() + 60_000
  ) {
    credentials =
      provider === 'google-calendar'
        ? await refreshGoogleCredentials(credentials)
        : await refreshMicrosoftCredentials(credentials)

    const { error: updateError } = await client
      .from('organization_integration_secrets')
      .update({
        encrypted_credentials:
          encryptIntegrationSecret(credentials),
        updated_at: new Date().toISOString(),
      })
      .eq('integration_id', record.id)
      .eq('organization_id', organizationId)

    if (updateError) {
      throw new Error(
        `Unable to save refreshed calendar token: ${updateError.message}`,
      )
    }
  }

  return {
    client,
    integration: record,
    accessToken: accessToken(credentials),
  }
}

function description(event: CalendarEventRecord) {
  return [
    event.description,
    event.meeting_url
      ? `Join meeting: ${event.meeting_url}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function googleBody(event: CalendarEventRecord) {
  if (event.all_day) {
    return {
      summary: event.title,
      description: description(event),
      location: event.location,
      start: {
        date: event.starts_at.slice(0, 10),
      },
      end: {
        date: event.ends_at.slice(0, 10),
      },
      attendees: event.attendee_emails.map((email) => ({
        email,
      })),
    }
  }

  return {
    summary: event.title,
    description: description(event),
    location: event.location,
    start: {
      dateTime: event.starts_at,
      timeZone: event.timezone,
    },
    end: {
      dateTime: event.ends_at,
      timeZone: event.timezone,
    },
    attendees: event.attendee_emails.map((email) => ({
      email,
    })),
  }
}

function outlookBody(event: CalendarEventRecord) {
  return {
    subject: event.title,
    body: {
      contentType: 'HTML',
      content: description(event)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>'),
    },
    start: {
      dateTime: event.starts_at,
      timeZone: 'UTC',
    },
    end: {
      dateTime: event.ends_at,
      timeZone: 'UTC',
    },
    location: event.location
      ? { displayName: event.location }
      : undefined,
    attendees: event.attendee_emails.map((email) => ({
      emailAddress: {
        address: email,
        name: email,
      },
      type: 'required',
    })),
    isAllDay: event.all_day,
    transactionId: `flowtix-${event.id}-${event.calendar_sync_revision}`,
  }
}

async function upsertGoogle(
  event: CalendarEventRecord,
) {
  const connection = await getConnection(
    event.organization_id,
    'google-calendar',
  )
  const existingId =
    event.external_calendar_event_id ??
    null
  const url = existingId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingId)}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  const response = await fetch(url, {
    method: existingId ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(googleBody(event)),
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (
    !response.ok ||
    typeof payload.id !== 'string'
  ) {
    throw new Error(
      typeof (payload.error as Record<string, unknown> | undefined)
        ?.message === 'string'
        ? String(
            (payload.error as Record<string, unknown>)
              .message,
          )
        : 'Google Calendar rejected the event synchronization.',
    )
  }

  return {
    id: payload.id,
    url:
      typeof payload.htmlLink === 'string'
        ? payload.htmlLink
        : null,
    etag:
      typeof payload.etag === 'string'
        ? payload.etag
        : null,
  }
}

async function deleteGoogle(
  event: CalendarEventRecord,
) {
  if (!event.external_calendar_event_id) {
    return
  }

  const connection = await getConnection(
    event.organization_id,
    'google-calendar',
  )
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event.external_calendar_event_id)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
      cache: 'no-store',
    },
  )

  if (!response.ok && response.status !== 404) {
    const payload = await readJson(response)
    throw new Error(
      typeof (payload.error as Record<string, unknown> | undefined)
        ?.message === 'string'
        ? String(
            (payload.error as Record<string, unknown>)
              .message,
          )
        : 'Google Calendar rejected the event deletion.',
    )
  }
}

async function upsertOutlook(
  event: CalendarEventRecord,
) {
  const connection = await getConnection(
    event.organization_id,
    'outlook',
  )
  const existingId =
    event.external_calendar_event_id ??
    null
  const response = await fetch(
    existingId
      ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(existingId)}`
      : 'https://graph.microsoft.com/v1.0/me/events',
    {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outlookBody(event)),
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (
    !response.ok ||
    (!existingId && typeof payload.id !== 'string')
  ) {
    const graphError =
      payload.error &&
      typeof payload.error === 'object'
        ? payload.error as Record<string, unknown>
        : {}

    throw new Error(
      typeof graphError.message === 'string'
        ? graphError.message
        : 'Microsoft Outlook rejected the event synchronization.',
    )
  }

  return {
    id:
      typeof payload.id === 'string'
        ? payload.id
        : existingId,
    url:
      typeof payload.webLink === 'string'
        ? payload.webLink
        : event.external_calendar_event_url,
    etag:
      typeof payload['@odata.etag'] === 'string'
        ? String(payload['@odata.etag'])
        : null,
  }
}

async function deleteOutlook(
  event: CalendarEventRecord,
) {
  if (!event.external_calendar_event_id) {
    return
  }

  const connection = await getConnection(
    event.organization_id,
    'outlook',
  )
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(event.external_calendar_event_id)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
      cache: 'no-store',
    },
  )

  if (!response.ok && response.status !== 404) {
    const payload = await readJson(response)
    const graphError =
      payload.error &&
      typeof payload.error === 'object'
        ? payload.error as Record<string, unknown>
        : {}

    throw new Error(
      typeof graphError.message === 'string'
        ? graphError.message
        : 'Microsoft Outlook rejected the event deletion.',
    )
  }
}

async function appendRun(input: {
  event: CalendarEventRecord
  action: CalendarSyncAction
  revision: number
  status: 'completed' | 'failed' | 'skipped'
  providerEventId?: string | null
  providerEventUrl?: string | null
  error?: string | null
}) {
  const client = serviceClient()
  await client.from('calendar_sync_runs').insert({
    organization_id: input.event.organization_id,
    calendar_event_id: input.event.id,
    provider: input.event.calendar_sync_provider,
    action: input.action,
    revision: input.revision,
    status: input.status,
    provider_event_id:
      input.providerEventId ?? null,
    provider_event_url:
      input.providerEventUrl ?? null,
    error_message: input.error ?? null,
    completed_at: new Date().toISOString(),
  })
}

export async function executeCalendarSync(
  payloadValue: JsonValue,
): Promise<Record<string, JsonValue>> {
  const payload = parsePayload(payloadValue)
  const client = serviceClient()

  const { data, error } = await client
    .from('calendar_events')
    .select(
      'id,organization_id,title,description,starts_at,ends_at,timezone,all_day,location,attendee_emails,meeting_url,calendar_sync_provider,calendar_sync_revision,calendar_sync_status,external_calendar_event_id,external_calendar_event_url,external_calendar_etag,deleted_at',
    )
    .eq('id', payload.eventId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Unable to load calendar event for synchronization: ${error.message}`,
    )
  }

  if (!data) {
    return {
      skipped: true,
      reason: 'Calendar event no longer exists.',
    }
  }

  const event = data as CalendarEventRecord

  if (event.calendar_sync_provider === 'none') {
    await appendRun({
      event,
      action: payload.action,
      revision: payload.revision,
      status: 'skipped',
      error: 'Calendar synchronization is disabled.',
    })

    return {
      skipped: true,
      reason: 'Calendar synchronization is disabled.',
    }
  }

  if (event.calendar_sync_revision !== payload.revision) {
    await appendRun({
      event,
      action: payload.action,
      revision: payload.revision,
      status: 'skipped',
      error: 'A newer calendar revision already exists.',
    })

    return {
      skipped: true,
      reason: 'A newer calendar revision already exists.',
    }
  }

  await client
    .from('calendar_events')
    .update({
      calendar_sync_status: 'processing',
      calendar_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.id)
    .eq('organization_id', event.organization_id)

  try {
    if (payload.action === 'delete') {
      if (
        event.calendar_sync_provider ===
        'google-calendar'
      ) {
        await deleteGoogle(event)
      } else {
        await deleteOutlook(event)
      }

      await appendRun({
        event,
        action: payload.action,
        revision: payload.revision,
        status: 'completed',
      })

      const { error: deleteError } = await client
        .from('calendar_events')
        .delete()
        .eq('id', event.id)
        .eq('organization_id', event.organization_id)

      if (deleteError) {
        throw new Error(
          `External event was deleted but the local record could not be removed: ${deleteError.message}`,
        )
      }

      return {
        deleted: true,
        provider: event.calendar_sync_provider,
      }
    }

    const result =
      event.calendar_sync_provider ===
      'google-calendar'
        ? await upsertGoogle(event)
        : await upsertOutlook(event)

    const now = new Date().toISOString()
    const { error: updateError } = await client
      .from('calendar_events')
      .update({
        calendar_sync_status: 'synced',
        calendar_sync_error: null,
        calendar_synced_at: now,
        external_calendar_event_id: result.id,
        external_calendar_event_url: result.url,
        external_calendar_etag: result.etag,
        google_event_id:
          event.calendar_sync_provider ===
          'google-calendar'
            ? result.id
            : null,
        google_event_url:
          event.calendar_sync_provider ===
          'google-calendar'
            ? result.url
            : null,
        updated_at: now,
      })
      .eq('id', event.id)
      .eq('organization_id', event.organization_id)
      .eq(
        'calendar_sync_revision',
        payload.revision,
      )

    if (updateError) {
      throw new Error(
        `Unable to save calendar synchronization result: ${updateError.message}`,
      )
    }

    await appendRun({
      event,
      action: payload.action,
      revision: payload.revision,
      status: 'completed',
      providerEventId: result.id,
      providerEventUrl: result.url,
    })

    return {
      synchronized: true,
      provider: event.calendar_sync_provider,
      externalEventId: result.id,
    }
  } catch (syncError) {
    const message =
      syncError instanceof Error
        ? syncError.message
        : 'Calendar synchronization failed.'

    await client
      .from('calendar_events')
      .update({
        calendar_sync_status: 'failed',
        calendar_sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.id)
      .eq('organization_id', event.organization_id)

    await appendRun({
      event,
      action: payload.action,
      revision: payload.revision,
      status: 'failed',
      error: message,
    })

    throw syncError
  }
}
