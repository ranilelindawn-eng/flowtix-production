import { Buffer } from 'node:buffer'

import { getOrganizationProviderConnection } from './provider-connections'
import type { ConfiguredTelephonyProviderName } from './provider'

export type ImportedProviderNumber = {
  providerNumberId: string
  phoneNumber: string
  friendlyName: string
  capabilities: Record<string, boolean>
}

function requireSignalWire(provider: ConfiguredTelephonyProviderName) {
  if (provider !== 'signalwire') {
    throw new Error('This telephony provider has been retired. Flowtix uses SignalWire only.')
  }
}

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

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'errors' in payload
        ? JSON.stringify((payload as { errors: unknown }).errors)
        : typeof payload === 'object' && payload && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : typeof payload === 'string'
            ? payload
            : `${response.status} ${response.statusText}`
    throw new Error(message || `Provider request failed with status ${response.status}.`)
  }

  return payload as T
}

export async function verifyProviderConnection(
  organizationId: string,
  provider: ConfiguredTelephonyProviderName,
): Promise<string> {
  requireSignalWire(provider)
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    organizationId,
    'signalwire',
  )
  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const spaceUrl = normalizeSpaceUrl(connection.config.space_url)

  await jsonRequest(
    `${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}.json`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
      },
    },
  )

  return projectId
}

export async function listOwnedProviderNumbers(
  organizationId: string,
  provider: ConfiguredTelephonyProviderName,
): Promise<ImportedProviderNumber[]> {
  requireSignalWire(provider)
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    organizationId,
    'signalwire',
  )
  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
  const data = await jsonRequest<{
    incoming_phone_numbers?: Array<{
      sid: string
      phone_number: string
      friendly_name?: string
      capabilities?: Record<string, boolean>
    }>
  }>(
    `${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/IncomingPhoneNumbers.json?PageSize=1000`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
      },
    },
  )

  return (data.incoming_phone_numbers ?? []).map((number) => ({
    providerNumberId: number.sid,
    phoneNumber: number.phone_number,
    friendlyName: number.friendly_name || number.phone_number,
    capabilities: {
      voice: number.capabilities?.voice !== false,
      sms: Boolean(number.capabilities?.sms),
      mms: Boolean(number.capabilities?.mms),
      fax: Boolean(number.capabilities?.fax),
    },
  }))
}

export async function configureProviderInboundRouting(input: {
  organizationId: string
  provider: ConfiguredTelephonyProviderName
  providerNumberId: string
  phoneNumber: string
}) {
  requireSignalWire(input.provider)
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'signalwire',
  )
  const siteUrl = required(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL').replace(/\/$/, '')
  const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
  const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
  const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
  const body = new URLSearchParams({
    VoiceUrl: `${siteUrl}/api/telephony/voice/inbound/signalwire`,
    VoiceMethod: 'POST',
  })

  await jsonRequest(
    `${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/IncomingPhoneNumbers/${encodeURIComponent(input.providerNumberId)}.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    },
  )
}
