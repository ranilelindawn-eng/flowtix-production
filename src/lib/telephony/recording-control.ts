import { Buffer } from 'node:buffer'

import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'

function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

function normalizeSpaceUrl(value: unknown): string {
  const raw = required(value, 'SignalWire Space URL').replace(/\/$/, '')
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function publicSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  if (!value) throw new Error('NEXT_PUBLIC_SITE_URL is required for recording callbacks.')
  return value
}

export async function startSignalWireCallRecording(input: {
  organizationId: string
  providerCallId: string
}): Promise<{ recordingSid: string | null }> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'signalwire',
  )

  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
  const callbackUrl = new URL(
    '/api/telephony/webhooks/calls/signalwire',
    `${publicSiteUrl()}/`,
  )
  callbackUrl.searchParams.set('organizationId', input.organizationId)

  const body = new URLSearchParams({
    RecordingChannels: 'dual',
    RecordingTrack: 'both',
    RecordingStatusCallback: callbackUrl.toString(),
    RecordingStatusCallbackEvent: 'completed',
  })

  const response = await fetch(
    `${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/Calls/${encodeURIComponent(input.providerCallId)}/Recordings.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    },
  )

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? '')
        : typeof payload === 'object' && payload && 'error' in payload
          ? String((payload as { error?: unknown }).error ?? '')
          : typeof payload === 'string'
            ? payload
            : ''
    throw new Error(
      detail || `SignalWire recording request failed with HTTP ${response.status}.`,
    )
  }

  const recordingSid =
    typeof payload === 'object' && payload && 'sid' in payload
      ? String((payload as { sid?: unknown }).sid ?? '').trim() || null
      : null

  return { recordingSid }
}
