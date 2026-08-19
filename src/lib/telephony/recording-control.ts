import { Buffer } from 'node:buffer'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

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

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function callbackToken(input: {
  apiToken: string
  organizationId: string
  callId: string
  providerCallId: string
  controlId: string
}): string {
  return createHmac('sha256', input.apiToken)
    .update(
      [
        'flowtix-signalwire-recording-v1',
        input.organizationId,
        input.callId,
        input.providerCallId,
        input.controlId,
      ].join(':'),
    )
    .digest('hex')
}

function responseError(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const message =
      typeof record.message === 'string'
        ? record.message.trim()
        : typeof record.error === 'string'
          ? record.error.trim()
          : ''
    if (message) return message
  }
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  return `SignalWire recording request failed with HTTP ${status}.`
}

export async function startSignalWireCallRecording(input: {
  organizationId: string
  callId: string
  providerCallId: string
}): Promise<{ recordingSid: string }> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'signalwire',
  )

  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
  const controlId = randomUUID()

  const callbackUrl = new URL(
    '/api/telephony/recording/signalwire',
    `${publicSiteUrl()}/`,
  )
  callbackUrl.searchParams.set('organizationId', input.organizationId)
  callbackUrl.searchParams.set('callId', input.callId)
  callbackUrl.searchParams.set('providerCallId', input.providerCallId)
  callbackUrl.searchParams.set('controlId', controlId)
  callbackUrl.searchParams.set(
    'token',
    callbackToken({
      apiToken,
      organizationId: input.organizationId,
      callId: input.callId,
      providerCallId: input.providerCallId,
      controlId,
    }),
  )

  // Browser calls use SignalWire RELAY/Calling call IDs. They are not
  // Compatibility API CallSids, so recording must be started through the
  // SignalWire Calling REST command endpoint rather than /api/laml/... .
  const response = await fetch(`${spaceUrl}/api/calling/calls`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command: 'calling.record',
      id: input.providerCallId,
      params: {
        control_id: controlId,
        audio: {
          beep: false,
          format: 'mp3',
          stereo: true,
          direction: 'both',
          initial_timeout: 0,
          end_silence_timeout: 0,
          max_length: 0,
          terminators: '',
        },
        status_url: callbackUrl.toString(),
      },
    }),
    cache: 'no-store',
  })

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    throw new Error(responseError(payload, response.status))
  }

  return { recordingSid: controlId }
}

export async function verifySignalWireRecordingCallback(input: {
  organizationId: string
  callId: string
  providerCallId: string
  controlId: string
  token: string
}): Promise<boolean> {
  if (!input.token) return false

  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'signalwire',
  )
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const expected = callbackToken({
    apiToken,
    organizationId: input.organizationId,
    callId: input.callId,
    providerCallId: input.providerCallId,
    controlId: input.controlId,
  })

  return safeEqual(input.token, expected)
}
