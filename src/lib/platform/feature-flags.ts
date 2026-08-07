import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

const asBoolean = (value: unknown): boolean => value === true

export type PlatformFeatureFlag = {
  flagKey: string
  name: string
  description: string | null
  defaultEnabled: boolean
  rolloutPercentage: number
  overrideCount: number
  enabledOverrideCount: number
  disabledOverrideCount: number
  updatedAt: string
  updatedBy: string | null
}

export type PlatformFeatureFlagOverride = {
  organizationId: string
  organizationName: string
  organizationStatus: string
  enabled: boolean
  rolloutPercentage: number | null
  updatedBy: string | null
  updatedByEmail: string | null
  updatedAt: string
}

export type PlatformFeatureFlagDetail = PlatformFeatureFlag & {
  overrides: PlatformFeatureFlagOverride[]
  overrideTotal: number
  limit: number
  offset: number
}

function parseFlag(value: unknown): PlatformFeatureFlag | null {
  if (!isRecord(value)) return null

  const flagKey = asString(value.flagKey)
  const name = asString(value.name)
  const updatedAt = asString(value.updatedAt)

  if (!flagKey || !name || !updatedAt) return null

  return {
    flagKey,
    name,
    description: asString(value.description),
    defaultEnabled: asBoolean(value.defaultEnabled),
    rolloutPercentage: asNumber(value.rolloutPercentage),
    overrideCount: asNumber(value.overrideCount),
    enabledOverrideCount: asNumber(value.enabledOverrideCount),
    disabledOverrideCount: asNumber(value.disabledOverrideCount),
    updatedAt,
    updatedBy: asString(value.updatedBy),
  }
}

function parseOverride(
  value: unknown,
): PlatformFeatureFlagOverride | null {
  if (!isRecord(value)) return null

  const organizationId = asString(value.organizationId)
  const organizationName = asString(value.organizationName)
  const organizationStatus = asString(value.organizationStatus)
  const updatedAt = asString(value.updatedAt)

  if (
    !organizationId ||
    !organizationName ||
    !organizationStatus ||
    !updatedAt
  ) {
    return null
  }

  const rollout = value.rolloutPercentage

  return {
    organizationId,
    organizationName,
    organizationStatus,
    enabled: asBoolean(value.enabled),
    rolloutPercentage:
      rollout === null || rollout === undefined
        ? null
        : asNumber(rollout),
    updatedBy: asString(value.updatedBy),
    updatedByEmail: asString(value.updatedByEmail),
    updatedAt,
  }
}

export async function getPlatformFeatureFlags(): Promise<
  PlatformFeatureFlag[]
> {
  await requirePlatformPermission('platform.flags.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_feature_flag_directory',
  )

  if (error) {
    throw new Error(
      `Unable to load platform feature flags: ${error.message}`,
    )
  }

  const rows: unknown[] = Array.isArray(data) ? data : []

  return rows.flatMap((row) => {
    const parsed = parseFlag(row)
    return parsed ? [parsed] : []
  })
}

export async function getPlatformFeatureFlag(
  flagKey: string,
  input?: {
    search?: string
    limit?: number
    offset?: number
  },
): Promise<PlatformFeatureFlagDetail | null> {
  await requirePlatformPermission('platform.flags.manage')

  const normalizedKey = flagKey.trim()
  if (!normalizedKey) return null

  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_feature_flag_detail',
    {
      p_flag_key: normalizedKey,
      p_search: input?.search?.trim() || null,
      p_limit: limit,
      p_offset: offset,
    },
  )

  if (error) {
    throw new Error(
      `Unable to load platform feature flag: ${error.message}`,
    )
  }

  if (!isRecord(data)) return null

  const base = parseFlag(data)
  if (!base) return null

  const overrideRows: unknown[] = Array.isArray(data.overrides)
    ? data.overrides
    : []

  return {
    ...base,
    overrides: overrideRows.flatMap((row) => {
      const parsed = parseOverride(row)
      return parsed ? [parsed] : []
    }),
    overrideTotal: asNumber(data.overrideTotal),
    limit: asNumber(data.limit) || limit,
    offset: asNumber(data.offset),
  }
}
