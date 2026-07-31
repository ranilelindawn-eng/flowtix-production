import { decryptIntegrationSecret } from '@/lib/integrations/crypto'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { isTelephonyProvider, type ConfiguredTelephonyProviderName } from './provider'

export type ProviderConnection<T extends Record<string, unknown> = Record<string, unknown>> = {
  provider: ConfiguredTelephonyProviderName
  integrationId: string
  organizationId: string
  config: Record<string, unknown>
  credentials: T
}

export async function getOrganizationProviderConnection<T extends Record<string, unknown>>(
  organizationId: string,
  provider: ConfiguredTelephonyProviderName,
): Promise<ProviderConnection<T>> {
  const admin = createTelephonyAdminClient()
  const { data: integration, error } = await admin.from('organization_integrations')
    .select('id,status,enabled,config').eq('organization_id', organizationId).eq('provider', provider).maybeSingle()
  if (error) throw new Error(`Unable to load the ${provider} integration: ${error.message}`)
  if (!integration || !integration.enabled || integration.status !== 'connected') throw new Error(`Connect ${provider} for this workspace before using the cloud dialer.`)
  const { data: secret, error: secretError } = await admin.from('organization_integration_secrets')
    .select('encrypted_credentials').eq('organization_id', organizationId).eq('integration_id', integration.id).maybeSingle()
  if (secretError) throw new Error(`Unable to load ${provider} credentials: ${secretError.message}`)
  if (!secret?.encrypted_credentials) throw new Error(`The connected ${provider} credentials are unavailable.`)
  return { provider, integrationId: integration.id, organizationId, config: (integration.config ?? {}) as Record<string, unknown>, credentials: decryptIntegrationSecret<T>(secret.encrypted_credentials) }
}

export async function getOrganizationActiveTelephonyProvider(organizationId: string): Promise<ConfiguredTelephonyProviderName> {
  const admin = createTelephonyAdminClient()
  const { data: defaultNumber, error } = await admin.from('organization_phone_numbers')
    .select('provider').eq('organization_id', organizationId).eq('is_default', true).maybeSingle()
  if (error) throw new Error(`Unable to load the active calling provider: ${error.message}`)
  if (defaultNumber?.provider && isTelephonyProvider(defaultNumber.provider)) return defaultNumber.provider

  const { data: integrations, error: integrationError } = await admin.from('organization_integrations')
    .select('provider').eq('organization_id', organizationId).eq('enabled', true).eq('status', 'connected')
  if (integrationError) throw new Error(`Unable to load calling providers: ${integrationError.message}`)
  const provider = (integrations ?? []).map((row) => row.provider).find(isTelephonyProvider)
  if (!provider) throw new Error('Connect a telephony provider and import an owned phone number before using the cloud dialer.')
  return provider
}
