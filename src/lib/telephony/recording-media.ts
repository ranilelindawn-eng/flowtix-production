import { Buffer } from 'node:buffer'

import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'

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
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
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

async function requireMediaResponse(url: string, init: RequestInit = {}): Promise<ProviderRecordingMedia> {
  const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'follow' })
  if (!response.ok || !response.body) {
    let detail = ''
    try { detail = (await response.text()).trim().slice(0, 500) } catch { detail = '' }
    throw new Error(`The recording provider returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`)
  }
  const contentType = response.headers.get('content-type')?.trim() || 'application/octet-stream'
  return { response, contentType, extension: contentExtension(contentType) }
}

export async function fetchProviderRecordingMedia(input: {
  organizationId: string
  recording: ProviderRecordingReference
}): Promise<ProviderRecordingMedia> {
  if ((input.recording.provider ?? 'signalwire').trim().toLowerCase() !== 'signalwire') {
    throw new Error('This recording belongs to a retired telephony provider and is no longer retrievable through the live provider connection.')
  }

  const providerUrl = required(input.recording.providerUrl, 'Provider recording URL')
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'signalwire',
  )
  const projectId = required(connection.credentials.projectId, 'Cloud calling project ID')
  const apiToken = required(connection.credentials.apiToken, 'Cloud calling API token')

  return requireMediaResponse(providerUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
    },
  })
}
