import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

export type PlatformApiKey = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export type PlatformApiKeyDirectory = {
  organizationId: string
  organizationName: string
  timezone: string
  keys: PlatformApiKey[]
}

function parseKey(value: unknown): PlatformApiKey | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const name = asString(value.name)
  const keyPrefix = asString(value.keyPrefix)
  const createdAt = asString(value.createdAt)

  if (!id || !name || !keyPrefix || !createdAt) return null

  return {
    id,
    name,
    keyPrefix,
    scopes: asStringArray(value.scopes),
    lastUsedAt: asString(value.lastUsedAt),
    revokedAt: asString(value.revokedAt),
    createdAt,
  }
}

export async function getPlatformApiKeys(
  organizationId: string,
): Promise<PlatformApiKeyDirectory> {
  await requirePlatformPermission('platform.api_keys.manage')

  const normalizedId = organizationId.trim()
  if (!normalizedId) {
    throw new Error('An organization is required.')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_api_key_directory',
    { p_organization_id: normalizedId },
  )

  if (error) {
    throw new Error(`Unable to load platform API keys: ${error.message}`)
  }

  if (!isRecord(data)) {
    throw new Error('The platform API key directory returned an invalid response.')
  }

  const organizationName = asString(data.organizationName)
  const timezone = asString(data.timezone)
  const rawKeys = Array.isArray(data.keys) ? data.keys : []

  if (!organizationName || !timezone) {
    throw new Error('The selected organization could not be resolved.')
  }

  return {
    organizationId: normalizedId,
    organizationName,
    timezone,
    keys: rawKeys.flatMap((row) => {
      const parsed = parseKey(row)
      return parsed ? [parsed] : []
    }),
  }
}
