import { Buffer } from 'node:buffer'

import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'
import {
  isTelephonyProvider,
  type ConfiguredTelephonyProviderName,
} from '@/lib/telephony/provider'

export type ProviderRecordingReference = {
  provider: string | null
  providerRecordingId: string
  providerUrl: string
}

export type ProviderRecordingMedia = {
  response: Response
  contentType: string
  extension: string
}

function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

function contentExtension(contentType: string): string {
  const normalized = contentType.toLowerCase().split(';', 1)[0].trim()
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3'
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'wav'
  if (normalized === 'audio/ogg') return 'ogg'
  if (normalized === 'audio/webm') return 'webm'
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a') return 'm4a'
  return 'audio'
}

async function requireMediaResponse(
  url: string,
  init: RequestInit = {},
): Promise<ProviderRecordingMedia> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    redirect: 'follow',
  })

  if (!response.ok || !response.body) {
    let detail = ''
    try {
      detail = (await response.text()).trim().slice(0, 500)
    } catch {
      detail = ''
    }

    throw new Error(
      `The recording provider returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
    )
  }

  const contentType =
    response.headers.get('content-type')?.trim() || 'application/octet-stream'

  return {
    response,
    contentType,
    extension: contentExtension(contentType),
  }
}

async function fetchTwilioMedia(
  organizationId: string,
  providerUrl: string,
): Promise<ProviderRecordingMedia> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    organizationId,
    'twilio',
  )
  const accountSid = required(connection.credentials.accountSid, 'Twilio Account SID')
  const authToken = required(connection.credentials.authToken, 'Twilio Auth Token')

  return requireMediaResponse(providerUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
  })
}

async function fetchSignalWireMedia(
  organizationId: string,
  providerUrl: string,
): Promise<ProviderRecordingMedia> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    organizationId,
    'signalwire',
  )
  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')

  // SignalWire recording URLs can be public or protected. Supplying the
  // project credentials works with protected media and keeps access server-side.
  return requireMediaResponse(providerUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
    },
  })
}

async function fetchPlivoMedia(
  organizationId: string,
  providerUrl: string,
): Promise<ProviderRecordingMedia> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    organizationId,
    'plivo',
  )
  const authId = required(connection.credentials.authId, 'Plivo Auth ID')
  const authToken = required(connection.credentials.authToken, 'Plivo Auth Token')

  // Plivo recording URLs are public by default, but accounts can enforce
  // HTTP Basic Auth. Always using the workspace credentials supports both.
  return requireMediaResponse(providerUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`,
    },
  })
}

async function fetchTelnyxMedia(
  organizationId: string,
  providerRecordingId: string,
): Promise<ProviderRecordingMedia> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    organizationId,
    'telnyx',
  )
  const apiKey = required(connection.credentials.apiKey, 'Telnyx API Key')

  // URLs sent by call.recording.saved are signed and short lived. Retrieve the
  // recording resource first so Flowtix gets a fresh download URL even when a
  // user opens an older recording.
  const metadataResponse = await fetch(
    `https://api.telnyx.com/v2/recordings/${encodeURIComponent(providerRecordingId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  )

  const body = await metadataResponse.text()
  if (!metadataResponse.ok) {
    throw new Error(
      `Telnyx could not refresh the recording URL (HTTP ${metadataResponse.status})${body ? `: ${body.slice(0, 500)}` : '.'}`,
    )
  }

  let payload: {
    data?: {
      download_urls?: { mp3?: string; wav?: string }
    }
  } = {}

  try {
    payload = body ? JSON.parse(body) as typeof payload : {}
  } catch {
    throw new Error('Telnyx returned an invalid recording metadata response.')
  }

  const url =
    payload.data?.download_urls?.mp3?.trim() ||
    payload.data?.download_urls?.wav?.trim() ||
    ''

  if (!url) {
    throw new Error('Telnyx did not return a downloadable recording URL.')
  }

  return requireMediaResponse(url)
}

export async function fetchProviderRecordingMedia(input: {
  organizationId: string
  recording: ProviderRecordingReference
}): Promise<ProviderRecordingMedia> {
  const providerValue = (input.recording.provider ?? 'twilio').trim().toLowerCase()

  if (!isTelephonyProvider(providerValue)) {
    throw new Error(`Recording media retrieval is not supported for provider "${providerValue || 'unknown'}".`)
  }

  const provider = providerValue as ConfiguredTelephonyProviderName
  const providerUrl = required(input.recording.providerUrl, 'Provider recording URL')
  const providerRecordingId = required(
    input.recording.providerRecordingId,
    'Provider recording ID',
  )

  if (provider === 'twilio') {
    return fetchTwilioMedia(input.organizationId, providerUrl)
  }

  if (provider === 'signalwire') {
    return fetchSignalWireMedia(input.organizationId, providerUrl)
  }

  if (provider === 'plivo') {
    return fetchPlivoMedia(input.organizationId, providerUrl)
  }

  return fetchTelnyxMedia(input.organizationId, providerRecordingId)
}
