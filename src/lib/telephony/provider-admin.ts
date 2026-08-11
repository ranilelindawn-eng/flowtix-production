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


export async function createTelnyxTelephonyCredential(
  apiKeyValue: unknown,
  connectionIdValue: unknown,
  name: string,
): Promise<{ id: string }> {
  const apiKey = required(apiKeyValue, 'Telnyx API Key')
  const connectionId = required(connectionIdValue, 'Telnyx Credential Connection ID')
  const safeName = name.trim() || 'Flowtix browser credential'

  const payload = await jsonRequest<{ data?: { id?: string; resource_id?: string } }>(
    'https://api.telnyx.com/v2/telephony_credentials',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: connectionId,
        name: safeName,
        tag: 'flowtix-webrtc',
      }),
    },
  )

  const credentialId = payload.data?.id?.trim()
  if (!credentialId) throw new Error('Telnyx did not return a Telephony Credential ID.')
  return { id: credentialId }
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


export async function configureProviderInboundRouting(input: {
  organizationId: string
  provider: ConfiguredTelephonyProviderName
  providerNumberId: string
  phoneNumber: string
}) {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    input.provider,
  )
  const siteUrl = required(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL').replace(/\/$/, '')

  if (input.provider === 'twilio') {
    const accountSid = required(connection.credentials.accountSid, 'Twilio Account SID')
    const authToken = required(connection.credentials.authToken, 'Twilio Auth Token')
    const body = new URLSearchParams({
      VoiceUrl: `${siteUrl}/api/telephony/voice/inbound`,
      VoiceMethod: 'POST',
    })
    await jsonRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(input.providerNumberId)}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    )
    return
  }

  if (input.provider === 'signalwire') {
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
    return
  }

  if (input.provider === 'telnyx') {
    const apiKey = required(connection.credentials.apiKey, 'Telnyx API Key')
    const connectionId = required(connection.config.connection_id, 'Telnyx Credential Connection ID')
    await jsonRequest(
      `https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(connectionId)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_event_url: `${siteUrl}/api/telephony/voice/inbound/telnyx`,
          webhook_api_version: '2',
          webhook_timeout_secs: 25,
          sip_uri_calling_preference: 'internal',
        }),
      },
    )
    await jsonRequest(
      `https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(input.providerNumberId)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      },
    )
    return
  }

  const authId = required(connection.credentials.authId, 'Plivo Auth ID')
  const authToken = required(connection.credentials.authToken, 'Plivo Auth Token')
  let appUuid = typeof connection.config.flowtix_application_uuid === 'string'
    ? connection.config.flowtix_application_uuid.trim()
    : ''
  if (!appUuid) {
    const app = await jsonRequest<{ app_id?: string; application_uuid?: string }>(
      `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Application/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_name: `Flowtix ${input.organizationId}`,
          answer_url: `${siteUrl}/api/telephony/voice/inbound/plivo`,
          answer_method: 'POST',
          hangup_url: `${siteUrl}/api/telephony/voice/inbound/plivo`,
          hangup_method: 'POST',
        }),
      },
    )
    appUuid = app.app_id || app.application_uuid || ''
    if (!appUuid) throw new Error('Plivo did not return an Application UUID.')
  }
  await jsonRequest(
    `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Number/${encodeURIComponent(input.phoneNumber.replace(/^\+/, ''))}/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_id: appUuid }),
    },
  )
}

export async function ensureTelnyxAgentCredential(input: {
  organizationId: string
  userId: string
}) {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'telnyx',
  )
  const apiKey = required(connection.credentials.apiKey, 'Telnyx API Key')
  const connectionId = required(connection.config.connection_id, 'Telnyx Credential Connection ID')
  const tag = `flowtix-${input.organizationId}-${input.userId}`
  const search = await jsonRequest<{ data?: Array<{ id?: string; sip_username?: string; sip_password?: string }> }>(
    `https://api.telnyx.com/v2/telephony_credentials?filter[resource_id]=connection:${encodeURIComponent(connectionId)}&filter[tag]=${encodeURIComponent(tag)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  )
  let credential = search.data?.[0]
  if (!credential?.id) {
    const created = await jsonRequest<{ data?: { id?: string; sip_username?: string; sip_password?: string } }>(
      'https://api.telnyx.com/v2/telephony_credentials',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: connectionId,
          name: `Flowtix ${input.userId}`,
          tag,
        }),
      },
    )
    credential = created.data
  }
  if (!credential?.id) throw new Error('Unable to provision the Telnyx agent credential.')
  return { id: credential.id, sipUsername: credential.sip_username || '' }
}

export async function ensurePlivoAgentEndpoint(input: {
  organizationId: string
  userId: string
}) {
  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    'plivo',
  )
  const authId = required(connection.credentials.authId, 'Plivo Auth ID')
  const authToken = required(connection.credentials.authToken, 'Plivo Auth Token')
  const username = `fx_${input.userId.replace(/-/g, '').slice(0, 32)}`
  const password = Buffer.from(`${input.organizationId}:${input.userId}:${Date.now()}`).toString('base64url').slice(0, 24) + 'A1!'
  const created = await jsonRequest<{ username?: string; alias?: string }>(
    `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Endpoint/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        alias: `Flowtix ${input.userId}`,
      }),
    },
  )
  return { username: created.username || username, password }
}
