import { decryptIntegrationSecret } from '@/lib/integrations/crypto'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export type TwilioCredentials = {
  accountSid: string
  authToken: string
  apiKeySid: string
  apiKeySecret: string
  twimlAppSid: string
}

export type TwilioConfiguration = TwilioCredentials & {
  callerId: string
  publicUrl: string
  integrationId: string
  organizationId: string
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is missing from the connected Twilio account.`)
  }
  return value.trim()
}

function normalizeE164(value: unknown): string {
  const phone = requiredString(value, 'Default Twilio phone number')
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('The default Twilio phone number must use E.164 format, for example +15551234567.')
  }
  return phone
}

export async function getOrganizationTwilioConfiguration(
  organizationId: string,
  callerIdOverride?: string | null,
): Promise<TwilioConfiguration> {
  const normalizedOrganizationId = organizationId.trim()
  if (!normalizedOrganizationId) throw new Error('Organization ID is required.')

  const admin = createTelephonyAdminClient()
  const { data: integration, error: integrationError } = await admin
    .from('organization_integrations')
    .select('id, status, enabled, config')
    .eq('organization_id', normalizedOrganizationId)
    .eq('provider', 'twilio')
    .maybeSingle()

  if (integrationError) throw new Error(`Unable to load the Twilio integration: ${integrationError.message}`)
  if (!integration || !integration.enabled || integration.status !== 'connected') {
    throw new Error('Connect a Twilio account for this workspace before using the cloud dialer.')
  }

  const { data: secret, error: secretError } = await admin
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', normalizedOrganizationId)
    .eq('integration_id', integration.id)
    .maybeSingle()

  if (secretError) throw new Error(`Unable to load Twilio credentials: ${secretError.message}`)
  if (!secret?.encrypted_credentials) throw new Error('The connected Twilio credentials are unavailable.')

  const credentials = decryptIntegrationSecret<Partial<TwilioCredentials>>(secret.encrypted_credentials)

  let callerId = callerIdOverride?.trim() || ''

  if (callerId) {
    const { data: selectedNumber, error: selectedNumberError } = await admin
      .from('organization_phone_numbers')
      .select('phone_number,capabilities')
      .eq('organization_id', normalizedOrganizationId)
      .eq('provider', 'twilio')
      .eq('phone_number', callerId)
      .maybeSingle()

    if (selectedNumberError) {
      throw new Error(`Unable to validate the selected caller ID: ${selectedNumberError.message}`)
    }

    const capabilities =
      selectedNumber?.capabilities && typeof selectedNumber.capabilities === 'object'
        ? (selectedNumber.capabilities as Record<string, unknown>)
        : {}

    if (!selectedNumber || capabilities.voice === false) {
      throw new Error('The selected caller ID is not an active voice number in this workspace.')
    }
  } else {
    const { data: defaultNumber, error: numberError } = await admin
      .from('organization_phone_numbers')
      .select('phone_number')
      .eq('organization_id', normalizedOrganizationId)
      .eq('provider', 'twilio')
      .eq('is_default', true)
      .maybeSingle()

    if (numberError) throw new Error(`Unable to load the default phone number: ${numberError.message}`)
    callerId = defaultNumber?.phone_number || (typeof integration.config?.phone_number === 'string' ? integration.config.phone_number : '')
  }

  return {
    accountSid: requiredString(credentials.accountSid, 'Twilio Account SID'),
    authToken: requiredString(credentials.authToken, 'Twilio Auth Token'),
    apiKeySid: requiredString(credentials.apiKeySid, 'Twilio API Key SID'),
    apiKeySecret: requiredString(credentials.apiKeySecret, 'Twilio API Key Secret'),
    twimlAppSid: requiredString(credentials.twimlAppSid, 'Twilio TwiML App SID'),
    callerId: normalizeE164(callerId),
    publicUrl: requiredString(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL').replace(/\/$/, ''),
    integrationId: integration.id,
    organizationId: normalizedOrganizationId,
  }
}


export type TelnyxCredentials = {
  apiKey: string
  telephonyCredentialId: string
}

export type TelnyxConfiguration = TelnyxCredentials & {
  connectionId: string
  callerId: string
  publicUrl: string
  integrationId: string
  organizationId: string
}

export async function getOrganizationTelnyxConfiguration(
  organizationId: string,
  callerIdOverride?: string | null,
): Promise<TelnyxConfiguration> {
  const normalizedOrganizationId = organizationId.trim()
  if (!normalizedOrganizationId) throw new Error('Organization ID is required.')

  const admin = createTelephonyAdminClient()
  const { data: integration, error: integrationError } = await admin
    .from('organization_integrations')
    .select('id, status, enabled, config')
    .eq('organization_id', normalizedOrganizationId)
    .eq('provider', 'telnyx')
    .maybeSingle()

  if (integrationError) throw new Error(`Unable to load the Telnyx integration: ${integrationError.message}`)
  if (!integration || !integration.enabled || integration.status !== 'connected') {
    throw new Error('Connect and test a Telnyx account for this workspace before using the cloud dialer.')
  }

  const { data: secret, error: secretError } = await admin
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', normalizedOrganizationId)
    .eq('integration_id', integration.id)
    .maybeSingle()

  if (secretError) throw new Error(`Unable to load Telnyx credentials: ${secretError.message}`)
  if (!secret?.encrypted_credentials) throw new Error('The connected Telnyx credentials are unavailable.')

  const credentials = decryptIntegrationSecret<Partial<TelnyxCredentials>>(secret.encrypted_credentials)
  let callerId = callerIdOverride?.trim() || ''

  if (callerId) {
    const { data: selectedNumber, error: selectedNumberError } = await admin
      .from('organization_phone_numbers')
      .select('phone_number,capabilities')
      .eq('organization_id', normalizedOrganizationId)
      .eq('provider', 'telnyx')
      .eq('phone_number', callerId)
      .maybeSingle()

    if (selectedNumberError) throw new Error(`Unable to validate the selected caller ID: ${selectedNumberError.message}`)
    const capabilities = selectedNumber?.capabilities && typeof selectedNumber.capabilities === 'object'
      ? selectedNumber.capabilities as Record<string, unknown>
      : {}
    if (!selectedNumber || capabilities.voice === false) {
      throw new Error('The selected caller ID is not an active Telnyx voice number in this workspace.')
    }
  } else {
    const { data: defaultNumber, error: numberError } = await admin
      .from('organization_phone_numbers')
      .select('phone_number')
      .eq('organization_id', normalizedOrganizationId)
      .eq('provider', 'telnyx')
      .eq('is_default', true)
      .maybeSingle()
    if (numberError) throw new Error(`Unable to load the default Telnyx number: ${numberError.message}`)
    callerId = defaultNumber?.phone_number || (typeof integration.config?.phone_number === 'string' ? integration.config.phone_number : '')
  }

  return {
    apiKey: requiredString(credentials.apiKey, 'Telnyx API Key'),
    telephonyCredentialId: requiredString(credentials.telephonyCredentialId, 'Telnyx Telephony Credential ID'),
    connectionId: requiredString(integration.config?.connection_id, 'Telnyx Credential Connection ID'),
    callerId: normalizeE164(callerId),
    publicUrl: requiredString(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL').replace(/\/$/, ''),
    integrationId: integration.id,
    organizationId: normalizedOrganizationId,
  }
}

export async function createTelnyxWebRtcToken(configuration: TelnyxConfiguration): Promise<string> {
  const response = await fetch(
    `https://api.telnyx.com/v2/telephony_credentials/${encodeURIComponent(configuration.telephonyCredentialId)}/token`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${configuration.apiKey}` },
      cache: 'no-store',
    },
  )

  const body = await response.text()
  if (!response.ok) {
    let message = body || `Telnyx returned HTTP ${response.status}.`
    try {
      const parsed = JSON.parse(body) as { errors?: Array<{ detail?: string; title?: string }> }
      message = parsed.errors?.[0]?.detail || parsed.errors?.[0]?.title || message
    } catch {}
    throw new Error(`Unable to create Telnyx WebRTC token: ${message}`)
  }

  try {
    const parsed = JSON.parse(body) as unknown
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
  } catch {}
  if (body.trim()) return body.trim().replace(/^"|"$/g, '')
  throw new Error('Telnyx returned an empty WebRTC token.')
}
