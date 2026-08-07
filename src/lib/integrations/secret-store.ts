import 'server-only'

import { createClient } from '@supabase/supabase-js'

function createIntegrationSecretAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase service-role configuration.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function requireId(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

export async function getEncryptedIntegrationSecret(input: {
  organizationId: string
  integrationId: string
}): Promise<string | null> {
  const organizationId = requireId(input.organizationId, 'Organization ID')
  const integrationId = requireId(input.integrationId, 'Integration ID')
  const admin = createIntegrationSecretAdminClient()

  const { data, error } = await admin
    .from('organization_integration_secrets')
    .select('encrypted_credentials')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to load encrypted integration credentials: ${error.message}`)
  }

  return typeof data?.encrypted_credentials === 'string'
    ? data.encrypted_credentials
    : null
}

export async function upsertEncryptedIntegrationSecret(input: {
  organizationId: string
  integrationId: string
  encryptedCredentials: string
  credentialVersion?: number
}): Promise<void> {
  const organizationId = requireId(input.organizationId, 'Organization ID')
  const integrationId = requireId(input.integrationId, 'Integration ID')
  const encryptedCredentials = input.encryptedCredentials.trim()

  if (!encryptedCredentials) {
    throw new Error('Encrypted integration credentials are required.')
  }

  const admin = createIntegrationSecretAdminClient()
  const { error } = await admin
    .from('organization_integration_secrets')
    .upsert(
      {
        integration_id: integrationId,
        organization_id: organizationId,
        encrypted_credentials: encryptedCredentials,
        credential_version: input.credentialVersion ?? 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'integration_id' },
    )

  if (error) {
    throw new Error(`Unable to save encrypted integration credentials: ${error.message}`)
  }
}

export async function deleteEncryptedIntegrationSecret(input: {
  organizationId: string
  integrationId: string
}): Promise<void> {
  const organizationId = requireId(input.organizationId, 'Organization ID')
  const integrationId = requireId(input.integrationId, 'Integration ID')
  const admin = createIntegrationSecretAdminClient()

  const { error } = await admin
    .from('organization_integration_secrets')
    .delete()
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)

  if (error) {
    throw new Error(`Unable to delete encrypted integration credentials: ${error.message}`)
  }
}
