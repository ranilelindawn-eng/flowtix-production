import 'server-only'

import { decryptIntegrationSecret } from '@/lib/integrations/crypto'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { listOwnedProviderNumbers } from '@/lib/telephony/provider-admin'
import {
  getOrganizationProviderConnection,
  type ProviderConnection,
} from '@/lib/telephony/provider-connections'

const SIGNALWIRE_PROVIDER = 'signalwire' as const

type Credentials = Record<string, unknown>

type PlatformManagedCallerId = {
  phoneNumber: string
  friendlyName: string
  providerNumberId: string | null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeSpaceUrl(value: unknown): string {
  const raw = text(value).replace(/\/$/, '')
  if (!raw) return ''
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value)
}

function capabilityRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function isVoiceCallingRow(capabilities: unknown): boolean {
  const record = capabilityRecord(capabilities)
  return (
    record.voice !== false &&
    record.sms_sender !== true &&
    record.hosted_messaging !== true
  )
}

function sourceIdentity(input: {
  config: Record<string, unknown>
  credentials: Credentials
}): string {
  const projectId = text(input.credentials.projectId)
  const spaceUrl = normalizeSpaceUrl(input.config.space_url)
  if (!projectId || !spaceUrl) return ''
  return `${projectId}|${spaceUrl}`
}

/**
 * SignalWire is platform infrastructure. Older Flowtix code stored the same
 * platform connection on individual workspaces, so downstream telephony code
 * still expects an organization-scoped integration row. For a new workspace,
 * copy the already-encrypted platform-owned SignalWire connection metadata
 * server-side. Subscribers never receive or manage these credentials.
 *
 * An existing disabled/disconnected workspace row is treated as an explicit
 * platform kill-switch and is never auto-enabled here.
 */
async function provisionPlatformSignalWireConnection(
  organizationId: string,
): Promise<void> {
  const admin = createTelephonyAdminClient()

  const { data: targetIntegration, error: targetError } = await admin
    .from('organization_integrations')
    .select('id,enabled,status')
    .eq('organization_id', organizationId)
    .eq('provider', SIGNALWIRE_PROVIDER)
    .maybeSingle()

  if (targetError) {
    throw new Error(
      `Unable to load Flowtix calling configuration: ${targetError.message}`,
    )
  }

  if (targetIntegration) {
    if (!targetIntegration.enabled || targetIntegration.status !== 'connected') {
      throw new Error(
        'Flowtix calling is currently unavailable for this workspace. Contact Flowtix support.',
      )
    }

    const { data: targetSecret, error: targetSecretError } = await admin
      .from('organization_integration_secrets')
      .select('id,encrypted_credentials')
      .eq('organization_id', organizationId)
      .eq('integration_id', targetIntegration.id)
      .maybeSingle()

    if (targetSecretError) {
      throw new Error(
        `Unable to load Flowtix calling credentials: ${targetSecretError.message}`,
      )
    }

    if (targetSecret?.encrypted_credentials) {
      return
    }
    // A connected row without a secret can result from an interrupted platform
    // bootstrap. Continue below and repair it from the canonical platform account.
  }

  const { data: sourceIntegrations, error: sourceError } = await admin
    .from('organization_integrations')
    .select('id,organization_id,config,created_at,updated_at')
    .eq('provider', SIGNALWIRE_PROVIDER)
    .eq('enabled', true)
    .eq('status', 'connected')
    .neq('organization_id', organizationId)
    .order('updated_at', { ascending: false })

  if (sourceError) {
    throw new Error(
      `Unable to load Flowtix calling infrastructure: ${sourceError.message}`,
    )
  }

  const sourceIds = (sourceIntegrations ?? []).map((row) => row.id)
  if (sourceIds.length === 0) {
    throw new Error(
      'Flowtix calling infrastructure is not configured yet. Contact Flowtix support.',
    )
  }

  const { data: sourceSecrets, error: sourceSecretError } = await admin
    .from('organization_integration_secrets')
    .select('integration_id,encrypted_credentials,credential_version,updated_at')
    .in('integration_id', sourceIds)

  if (sourceSecretError) {
    throw new Error(
      `Unable to load Flowtix calling credentials: ${sourceSecretError.message}`,
    )
  }

  const secretByIntegration = new Map(
    (sourceSecrets ?? []).map((secret) => [secret.integration_id, secret]),
  )

  const usableSources = (sourceIntegrations ?? []).flatMap((integration) => {
    const secret = secretByIntegration.get(integration.id)
    if (!secret?.encrypted_credentials) return []

    try {
      const credentials = decryptIntegrationSecret<Credentials>(
        secret.encrypted_credentials,
      )
      const config = (integration.config ?? {}) as Record<string, unknown>
      const identity = sourceIdentity({ config, credentials })
      if (!identity) return []

      return [{ integration, secret, identity }]
    } catch {
      return []
    }
  })

  if (usableSources.length === 0) {
    throw new Error(
      'Flowtix calling infrastructure is missing valid provider credentials. Contact Flowtix support.',
    )
  }

  const providerIdentities = new Set(
    usableSources.map((source) => source.identity),
  )
  if (providerIdentities.size !== 1) {
    throw new Error(
      'Flowtix calling infrastructure has multiple provider accounts and requires platform review.',
    )
  }

  const source = [...usableSources].sort((left, right) => {
    const leftUpdated = Date.parse(text(left.secret.updated_at)) || 0
    const rightUpdated = Date.parse(text(right.secret.updated_at)) || 0
    return rightUpdated - leftUpdated
  })[0]
  const now = new Date().toISOString()

  const { data: createdIntegration, error: integrationError } = await admin
    .from('organization_integrations')
    .upsert(
      {
        organization_id: organizationId,
        provider: SIGNALWIRE_PROVIDER,
        enabled: true,
        status: 'connected',
        config: source.integration.config ?? {},
        connected_by: null,
        connected_at: now,
        last_error: null,
        updated_at: now,
      },
      { onConflict: 'organization_id,provider' },
    )
    .select('id')
    .single()

  if (integrationError || !createdIntegration) {
    throw new Error(
      `Unable to provision Flowtix calling for this workspace: ${integrationError?.message ?? 'Provider connection was not created.'}`,
    )
  }

  const { error: secretInsertError } = await admin
    .from('organization_integration_secrets')
    .upsert(
      {
        integration_id: createdIntegration.id,
        organization_id: organizationId,
        encrypted_credentials: source.secret.encrypted_credentials,
        credential_version: source.secret.credential_version ?? 1,
        updated_at: now,
      },
      { onConflict: 'integration_id' },
    )

  if (secretInsertError) {
    throw new Error(
      `Unable to provision Flowtix calling credentials: ${secretInsertError.message}`,
    )
  }
}

export async function getPlatformManagedSignalWireConnection(
  organizationId: string,
): Promise<ProviderConnection<Credentials>> {
  const normalizedOrganizationId = organizationId.trim()
  if (!normalizedOrganizationId) {
    throw new Error('Organization ID is required.')
  }

  try {
    return await getOrganizationProviderConnection<Credentials>(
      normalizedOrganizationId,
      SIGNALWIRE_PROVIDER,
    )
  } catch {
    await provisionPlatformSignalWireConnection(normalizedOrganizationId)
    return getOrganizationProviderConnection<Credentials>(
      normalizedOrganizationId,
      SIGNALWIRE_PROVIDER,
    )
  }
}

/**
 * Resolve the outbound caller ID entirely on the server.
 *
 * The Flowtix calling line is platform infrastructure and is intentionally
 * separate from the subscriber's Business SMS Number workflow. We therefore
 * do not create an organization_phone_numbers row merely to place outbound
 * calls; that table remains available for subscriber-specific number capacity
 * such as the approved company SMS sender.
 */
export async function resolvePlatformManagedCallerId(
  organizationId: string,
): Promise<PlatformManagedCallerId> {
  const normalizedOrganizationId = organizationId.trim()
  if (!normalizedOrganizationId) {
    throw new Error('Organization ID is required.')
  }

  const admin = createTelephonyAdminClient()

  // Preserve a previously assigned Flowtix voice line when one already exists,
  // but never reinterpret an approved Hosted Messaging/SMS sender as the
  // outbound caller ID.
  const { data: existingRows, error: existingError } = await admin
    .from('organization_phone_numbers')
    .select(
      'provider_number_id,phone_number,friendly_name,capabilities,is_default,created_at',
    )
    .eq('organization_id', normalizedOrganizationId)
    .eq('provider', SIGNALWIRE_PROVIDER)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (existingError) {
    throw new Error(
      `Unable to load the Flowtix calling number: ${existingError.message}`,
    )
  }

  const existing = (existingRows ?? []).find(
    (row) => isE164(row.phone_number) && isVoiceCallingRow(row.capabilities),
  )

  if (existing) {
    return {
      phoneNumber: existing.phone_number,
      friendlyName: existing.friendly_name,
      providerNumberId: existing.provider_number_id,
    }
  }

  await getPlatformManagedSignalWireConnection(normalizedOrganizationId)

  const [providerNumbers, activeSmsResult] = await Promise.all([
    listOwnedProviderNumbers(normalizedOrganizationId, SIGNALWIRE_PROVIDER),
    admin
      .from('organization_sms_sender_requests')
      .select('phone_number')
      .eq('status', 'active'),
  ])

  if (activeSmsResult.error && activeSmsResult.error.code !== '42P01') {
    throw new Error(
      `Unable to verify Flowtix calling-number availability: ${activeSmsResult.error.message}`,
    )
  }

  const activeSmsNumbers = new Set(
    (activeSmsResult.data ?? [])
      .map((row) => row.phone_number)
      .filter((value): value is string => typeof value === 'string'),
  )

  const voiceNumbers = providerNumbers.filter(
    (number) =>
      isE164(number.phoneNumber) &&
      number.capabilities.voice !== false &&
      !activeSmsNumbers.has(number.phoneNumber),
  )

  if (voiceNumbers.length === 0) {
    throw new Error(
      'Flowtix does not currently have a platform calling number available. Contact Flowtix support.',
    )
  }

  const selected = [...voiceNumbers].sort((left, right) => {
    const preferred = (friendlyName: string) =>
      /flowtix|calling|voice|outbound|sales line|test line/i.test(friendlyName)
        ? 0
        : 1

    const priorityDifference =
      preferred(left.friendlyName) - preferred(right.friendlyName)
    if (priorityDifference !== 0) return priorityDifference
    return left.phoneNumber.localeCompare(right.phoneNumber)
  })[0]

  return {
    phoneNumber: selected.phoneNumber,
    friendlyName: selected.friendlyName || 'Flowtix Calling',
    providerNumberId: selected.providerNumberId || null,
  }
}
