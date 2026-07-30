import { createClient } from '@supabase/supabase-js'

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from './crypto'

type MicrosoftCredentials = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expiresAt?: string
  scope?: string
  token_type?: string
}

type TeamsMeetingInput = {
  subject: string
  startTime: Date
  endTime: Date
  attendeeEmails?: string[]
}

type TeamsMeeting = {
  id: string
  joinWebUrl: string
  subject?: string
  startDateTime?: string
  endDateTime?: string
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

async function refreshMicrosoftToken(credentials: MicrosoftCredentials) {
  if (!credentials.refresh_token) {
    throw new Error('Microsoft refresh token is unavailable. Reconnect Microsoft Teams.')
  }

  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || 'common'
  const response = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: required('MICROSOFT_CLIENT_ID'),
        client_secret: required('MICROSOFT_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        scope: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'User.Read',
          'OnlineMeetings.ReadWrite',
        ].join(' '),
      }),
      cache: 'no-store',
    },
  )

  const payload = (await response.json()) as MicrosoftCredentials & {
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        'Microsoft Teams token refresh failed. Reconnect Microsoft Teams.',
    )
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

export async function getTeamsConnection(organizationId: string) {
  const admin = adminClient()
  const { data: integration, error } = await admin
    .from('organization_integrations')
    .select('id,enabled,status,config')
    .eq('organization_id', organizationId)
    .eq('provider', 'microsoft-teams')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!integration || !integration.enabled || integration.status !== 'connected') {
    throw new Error('Microsoft Teams is not connected for this organization.')
  }

  const { data: secret, error: secretError } = await admin
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', organizationId)
    .eq('integration_id', integration.id)
    .single()

  if (secretError || !secret) {
    throw new Error(
      secretError?.message || 'Microsoft Teams credentials are unavailable.',
    )
  }

  let credentials = decryptIntegrationSecret<MicrosoftCredentials>(
    secret.encrypted_credentials,
  )
  const expiresAt = credentials.expiresAt
    ? new Date(credentials.expiresAt).getTime()
    : 0

  if (!credentials.access_token || expiresAt <= Date.now() + 60_000) {
    credentials = await refreshMicrosoftToken(credentials)
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

function participants(attendeeEmails: string[] = []) {
  const attendees = attendeeEmails.map((email) => ({
    upn: email,
    role: 'attendee',
  }))

  return attendees.length > 0 ? { attendees } : undefined
}

export async function createTeamsMeeting(
  organizationId: string,
  input: TeamsMeetingInput,
): Promise<TeamsMeeting> {
  const { accessToken } = await getTeamsConnection(organizationId)
  const response = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: input.subject,
      startDateTime: input.startTime.toISOString(),
      endDateTime: input.endTime.toISOString(),
      participants: participants(input.attendeeEmails),
    }),
    cache: 'no-store',
  })

  const payload = (await response.json()) as TeamsMeeting & {
    error?: { message?: string; code?: string }
  }

  if (!response.ok || !payload.id || !payload.joinWebUrl) {
    const detail = payload.error?.message || payload.error?.code
    throw new Error(
      detail ||
        'Microsoft Teams rejected the meeting request. Confirm the connected account has a Microsoft 365/Teams license and reconnect Teams to grant OnlineMeetings.ReadWrite.',
    )
  }

  return payload
}

export async function updateTeamsMeeting(
  organizationId: string,
  meetingId: string,
  input: TeamsMeetingInput,
) {
  const { accessToken } = await getTeamsConnection(organizationId)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: input.subject,
        startDateTime: input.startTime.toISOString(),
        endDateTime: input.endTime.toISOString(),
        participants: participants(input.attendeeEmails),
      }),
      cache: 'no-store',
    },
  )

  if (!response.ok) {
    const payload = (await response.json()) as {
      error?: { message?: string; code?: string }
    }
    throw new Error(
      payload.error?.message ||
        payload.error?.code ||
        'Microsoft Teams rejected the meeting update.',
    )
  }
}

export async function deleteTeamsMeeting(
  organizationId: string,
  meetingId: string,
) {
  const { accessToken } = await getTeamsConnection(organizationId)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  )

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json()) as {
      error?: { message?: string; code?: string }
    }
    throw new Error(
      payload.error?.message ||
        payload.error?.code ||
        'Microsoft Teams rejected the meeting deletion.',
    )
  }
}
