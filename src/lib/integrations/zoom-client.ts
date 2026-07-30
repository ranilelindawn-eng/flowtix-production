import { createClient } from '@supabase/supabase-js'

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from './crypto'

type ZoomCredentials = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expiresAt?: string
  scope?: string
  token_type?: string
}

type ZoomMeetingInput = {
  topic: string
  agenda?: string
  startTime: Date
  durationMinutes: number
  timezone: string
  attendeeEmails?: string[]
}

type ZoomMeeting = {
  id: number
  uuid?: string
  join_url: string
  start_url?: string
  password?: string
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration.')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} environment variable.`)
  return value
}

async function refreshZoomToken(credentials: ZoomCredentials) {
  if (!credentials.refresh_token) {
    throw new Error('Zoom refresh token is unavailable. Reconnect Zoom.')
  }

  const basic = Buffer.from(
    `${required('ZOOM_CLIENT_ID')}:${required('ZOOM_CLIENT_SECRET')}`,
  ).toString('base64')

  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refresh_token,
    }),
    cache: 'no-store',
  })

  const payload = (await response.json()) as ZoomCredentials & {
    reason?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.reason || 'Zoom token refresh failed.')
  }

  return {
    ...credentials,
    ...payload,
    refresh_token: payload.refresh_token ?? credentials.refresh_token,
    expiresAt: new Date(
      Date.now() + (payload.expires_in ?? 3600) * 1000,
    ).toISOString(),
  }
}

export async function getZoomConnection(organizationId: string) {
  const admin = adminClient()
  const { data: integration, error } = await admin
    .from('organization_integrations')
    .select('id,enabled,status,config')
    .eq('organization_id', organizationId)
    .eq('provider', 'zoom')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!integration || !integration.enabled || integration.status !== 'connected') {
    throw new Error('Zoom is not connected for this organization.')
  }

  const { data: secret, error: secretError } = await admin
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', organizationId)
    .eq('integration_id', integration.id)
    .single()

  if (secretError || !secret) {
    throw new Error(secretError?.message || 'Zoom credentials are unavailable.')
  }

  let credentials = decryptIntegrationSecret<ZoomCredentials>(
    secret.encrypted_credentials,
  )
  const expiresAt = credentials.expiresAt
    ? new Date(credentials.expiresAt).getTime()
    : 0

  if (!credentials.access_token || expiresAt <= Date.now() + 60_000) {
    credentials = await refreshZoomToken(credentials)
    const { error: updateError } = await admin
      .from('organization_integration_secrets')
      .update({
        encrypted_credentials: encryptIntegrationSecret(credentials),
        updated_at: new Date().toISOString(),
      })
      .eq('integration_id', integration.id)

    if (updateError) throw new Error(updateError.message)
  }

  return {
    accessToken: credentials.access_token,
    integration,
  }
}

export async function createZoomMeeting(
  organizationId: string,
  input: ZoomMeetingInput,
): Promise<ZoomMeeting> {
  const { accessToken } = await getZoomConnection(organizationId)

  const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: input.topic,
      type: 2,
      agenda: input.agenda,
      start_time: input.startTime.toISOString(),
      duration: input.durationMinutes,
      timezone: input.timezone,
      settings: {
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
        approval_type: 2,
        registrants_email_notification: false,
        meeting_authentication: false,
      },
    }),
    cache: 'no-store',
  })

  const payload = (await response.json()) as ZoomMeeting & {
    message?: string
  }

  if (!response.ok || !payload.id || !payload.join_url) {
    throw new Error(payload.message || 'Zoom rejected the meeting request.')
  }

  return payload
}

export async function updateZoomMeeting(
  organizationId: string,
  meetingId: string,
  input: ZoomMeetingInput,
) {
  const { accessToken } = await getZoomConnection(organizationId)
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: input.topic,
        agenda: input.agenda,
        start_time: input.startTime.toISOString(),
        duration: input.durationMinutes,
        timezone: input.timezone,
      }),
      cache: 'no-store',
    },
  )

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string }
    throw new Error(payload.message || 'Zoom rejected the meeting update.')
  }
}

export async function deleteZoomMeeting(
  organizationId: string,
  meetingId: string,
) {
  const { accessToken } = await getZoomConnection(organizationId)
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  )

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json()) as { message?: string }
    throw new Error(payload.message || 'Zoom rejected the meeting deletion.')
  }
}
