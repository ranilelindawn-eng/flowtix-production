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

function requireOrganizationId(value: string): string {
  const organizationId = value.trim()
  if (!organizationId) throw new Error('Organization ID is required.')
  return organizationId
}

function hasVoiceCapability(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== 'object') return true
  return (capabilities as Record<string, unknown>).voice !== false
}

export async function getOrganizationProviderConnection<T extends Record<string, unknown>>(
  organizationId: string,
  provider: ConfiguredTelephonyProviderName,
): Promise<ProviderConnection<T>> {
  if (provider !== 'signalwire') {
    throw new Error('This telephony provider has been retired. Flowtix uses SignalWire only.')
  }
  const normalizedOrganizationId = requireOrganizationId(organizationId)
  const admin = createTelephonyAdminClient()
  const { data: integration, error } = await admin
    .from('organization_integrations')
    .select('id,status,enabled,config')
    .eq('organization_id', normalizedOrganizationId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) throw new Error(`Unable to load the ${provider} integration: ${error.message}`)
  if (!integration || !integration.enabled || integration.status !== 'connected') {
    throw new Error(`Connect and verify ${provider} for this workspace before using the cloud dialer.`)
  }

  const { data: secret, error: secretError } = await admin
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', normalizedOrganizationId)
    .eq('integration_id', integration.id)
    .maybeSingle()

  if (secretError) throw new Error(`Unable to load ${provider} credentials: ${secretError.message}`)
  if (!secret?.encrypted_credentials) {
    throw new Error(`The connected ${provider} credentials are unavailable.`)
  }

  return {
    provider,
    integrationId: integration.id,
    organizationId: normalizedOrganizationId,
    config: (integration.config ?? {}) as Record<string, unknown>,
    credentials: decryptIntegrationSecret<T>(secret.encrypted_credentials),
  }
}

export async function getOrganizationActiveTelephonyProvider(
  organizationId: string,
): Promise<ConfiguredTelephonyProviderName> {
  const normalizedOrganizationId = requireOrganizationId(organizationId)
  const admin = createTelephonyAdminClient()

  const { data: defaultNumber, error: numberError } = await admin
    .from('organization_phone_numbers')
    .select('provider,capabilities')
    .eq('organization_id', normalizedOrganizationId)
    .eq('is_default', true)
    .maybeSingle()

  if (numberError) {
    throw new Error(`Unable to load the active calling provider: ${numberError.message}`)
  }

  if (
    defaultNumber?.provider &&
    isTelephonyProvider(defaultNumber.provider) &&
    hasVoiceCapability(defaultNumber.capabilities)
  ) {
    await getOrganizationProviderConnection(normalizedOrganizationId, defaultNumber.provider)
    return defaultNumber.provider
  }

  const { data: numbers, error: fallbackNumberError } = await admin
    .from('organization_phone_numbers')
    .select('provider,capabilities,created_at')
    .eq('organization_id', normalizedOrganizationId)
    .order('created_at', { ascending: true })

  if (fallbackNumberError) {
    throw new Error(`Unable to load workspace phone numbers: ${fallbackNumberError.message}`)
  }

  for (const row of numbers ?? []) {
    if (!isTelephonyProvider(row.provider) || !hasVoiceCapability(row.capabilities)) continue
    try {
      await getOrganizationProviderConnection(normalizedOrganizationId, row.provider)
      return row.provider
    } catch {
      // Continue to the next owned voice number. A disconnected integration must not be selected.
    }
  }

  throw new Error(
    'Flowtix calling is not available for this workspace yet. Contact Flowtix support.',
  )
}
