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
  if (!callerId) {
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
