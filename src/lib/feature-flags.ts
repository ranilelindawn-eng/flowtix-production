import 'server-only'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export const OPERATIONAL_FEATURE_FLAGS = [
  'advanced_dashboards',
  'usage_billing',
  'threat_detection',
  'scheduled_exports',
] as const

export type OperationalFeatureFlag =
  (typeof OPERATIONAL_FEATURE_FLAGS)[number]

type ResolvedFeatureFlagRow = {
  flag_key: string
  enabled: boolean
  rollout_percentage: number
  source: 'platform_default' | 'organization_override'
}

export type ResolvedFeatureFlag = {
  flagKey: OperationalFeatureFlag
  organizationId: string
  enabled: boolean
  rolloutPercentage: number
  source: 'platform_default' | 'organization_override'
}

const loadOperationalFeatureFlag = cache(
  async (
    flagKey: OperationalFeatureFlag,
    organizationId: string,
  ): Promise<ResolvedFeatureFlag> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(
      'resolve_feature_flag',
      {
        p_flag_key: flagKey,
        p_organization_id: organizationId,
      },
    )

    if (error) {
      throw new Error(
        `Unable to resolve feature flag ${flagKey}: ${error.message}`,
      )
    }

    const row = Array.isArray(data)
      ? (data[0] as ResolvedFeatureFlagRow | undefined)
      : (data as ResolvedFeatureFlagRow | null)

    if (!row) {
      throw new Error(
        `Feature flag ${flagKey} is not configured.`,
      )
    }

    return {
      flagKey,
      organizationId,
      enabled: row.enabled === true,
      rolloutPercentage: Number(row.rollout_percentage) || 0,
      source:
        row.source === 'organization_override'
          ? 'organization_override'
          : 'platform_default',
    }
  },
)

export async function getOperationalFeatureFlag(
  flagKey: OperationalFeatureFlag,
  organizationId?: string,
): Promise<ResolvedFeatureFlag | null> {
  let resolvedOrganizationId = organizationId?.trim() ?? ''

  if (!resolvedOrganizationId) {
    const organization = await getCurrentOrganization()
    if (!organization) return null
    resolvedOrganizationId = organization.organization_id
  }

  return loadOperationalFeatureFlag(
    flagKey,
    resolvedOrganizationId,
  )
}

export async function isOperationalFeatureEnabled(
  flagKey: OperationalFeatureFlag,
  organizationId?: string,
): Promise<boolean> {
  const resolved = await getOperationalFeatureFlag(
    flagKey,
    organizationId,
  )
  return resolved?.enabled === true
}
