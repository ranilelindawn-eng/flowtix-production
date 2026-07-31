import { Buffer } from 'node:buffer'
import { getOrganizationProviderConnection } from './provider-connections'
import type { ConfiguredTelephonyProviderName } from './provider'

export type ImportedProviderNumber = {
  providerNumberId: string
  phoneNumber: string
  friendlyName: string
  capabilities: Record<string, boolean>
}

function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
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
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'errors' in payload
      ? JSON.stringify((payload as { errors: unknown }).errors)
      : typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : typeof payload === 'string' ? payload : `${response.status} ${response.statusText}`
    throw new Error(message || `Provider request failed with status ${response.status}.`)
  }
  return payload as T
}

export async function verifyProviderConnection(organizationId: string, provider: ConfiguredTelephonyProviderName): Promise<string> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(organizationId, provider)
  if (provider === 'twilio') {
    const accountSid = required(connection.credentials.accountSid, 'Twilio Account SID')
    const authToken = required(connection.credentials.authToken, 'Twilio Auth Token')
    const data = await jsonRequest<{ friendly_name?: string; sid?: string }>(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
    })
    return data.friendly_name || data.sid || accountSid
  }
  if (provider === 'telnyx') {
    const apiKey = required(connection.credentials.apiKey, 'Telnyx API Key')
    const connectionId = required(connection.config.connection_id, 'Telnyx Connection ID')
    const data = await jsonRequest<{ data?: { connection_name?: string; id?: string } }>(`https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(connectionId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return data.data?.connection_name || data.data?.id || connectionId
  }
  if (provider === 'signalwire') {
    const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
    const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
    const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
    await jsonRequest(`${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}` },
    })
    return projectId
  }
  const authId = required(connection.credentials.authId, 'Plivo Auth ID')
  const authToken = required(connection.credentials.authToken, 'Plivo Auth Token')
  const data = await jsonRequest<{ name?: string; auth_id?: string }>(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/`, {
    headers: { Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}` },
  })
  return data.name || data.auth_id || authId
}

export async function listOwnedProviderNumbers(organizationId: string, provider: ConfiguredTelephonyProviderName): Promise<ImportedProviderNumber[]> {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(organizationId, provider)
  if (provider === 'twilio') {
    const accountSid = required(connection.credentials.accountSid, 'Twilio Account SID')
    const authToken = required(connection.credentials.authToken, 'Twilio Auth Token')
    const data = await jsonRequest<{ incoming_phone_numbers?: Array<{ sid: string; phone_number: string; friendly_name?: string; capabilities?: Record<string, boolean> }> }>(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?PageSize=1000`, {
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
    })
    return (data.incoming_phone_numbers ?? []).map((number) => ({ providerNumberId: number.sid, phoneNumber: number.phone_number, friendlyName: number.friendly_name || number.phone_number, capabilities: { voice: Boolean(number.capabilities?.voice), sms: Boolean(number.capabilities?.sms), mms: Boolean(number.capabilities?.mms), fax: Boolean(number.capabilities?.fax) } }))
  }
  if (provider === 'telnyx') {
    const apiKey = required(connection.credentials.apiKey, 'Telnyx API Key')
    const data = await jsonRequest<{ data?: Array<{ id: string; phone_number: string; status?: string; connection_id?: string; features?: Array<{ name?: string }> }> }>('https://api.telnyx.com/v2/phone_numbers?page[size]=250', { headers: { Authorization: `Bearer ${apiKey}` } })
    return (data.data ?? []).filter((number) => number.status !== 'deleted').map((number) => ({
      providerNumberId: number.id,
      phoneNumber: number.phone_number,
      friendlyName: number.phone_number,
      capabilities: { voice: true, sms: (number.features ?? []).some((feature) => /sms|messaging/i.test(feature.name ?? '')), mms: (number.features ?? []).some((feature) => /mms/i.test(feature.name ?? '')), fax: false },
    }))
  }
  if (provider === 'signalwire') {
    const projectId = required(connection.credentials.projectId, 'SignalWire Project ID')
    const apiToken = required(connection.credentials.apiToken, 'SignalWire API Token')
    const spaceUrl = normalizeSpaceUrl(connection.config.space_url)
    const data = await jsonRequest<{ incoming_phone_numbers?: Array<{ sid: string; phone_number: string; friendly_name?: string; capabilities?: Record<string, boolean> }> }>(`${spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/IncomingPhoneNumbers.json?PageSize=1000`, { headers: { Authorization: `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}` } })
    return (data.incoming_phone_numbers ?? []).map((number) => ({ providerNumberId: number.sid, phoneNumber: number.phone_number, friendlyName: number.friendly_name || number.phone_number, capabilities: { voice: number.capabilities?.voice !== false, sms: Boolean(number.capabilities?.sms), mms: Boolean(number.capabilities?.mms), fax: Boolean(number.capabilities?.fax) } }))
  }
  const authId = required(connection.credentials.authId, 'Plivo Auth ID')
  const authToken = required(connection.credentials.authToken, 'Plivo Auth Token')
  const data = await jsonRequest<{ objects?: Array<{ id?: string; number: string; alias?: string; type?: string }> }>(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Number/?limit=20&offset=0`, { headers: { Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}` } })
  return (data.objects ?? []).map((number) => ({ providerNumberId: number.id || number.number, phoneNumber: number.number.startsWith('+') ? number.number : `+${number.number}`, friendlyName: number.alias || number.number, capabilities: { voice: true, sms: /sms/i.test(number.type ?? ''), mms: false, fax: false } }))
}
