import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export const FEATURE_ENTITLEMENTS = [
  'crm.core',
  'calendar.core',
  'communications.manual',
  'campaigns.basic',
  'reports.basic',
  'reports.advanced',
  'reports.export',
  'dialer.cloud',
  'ai.chat',
  'ai.call_analysis',
  'ai.email',
  'ai.tasks',
  'ai.transcription',
  'automation.sequences',
  'automation.campaigns',
  'integrations.google',
  'integrations.premium',
  'api.access',
  'team.advanced',
  'security.advanced',
] as const

export type FeatureEntitlement =
  (typeof FEATURE_ENTITLEMENTS)[number]

export type EntitlementSnapshot = {
  organizationId: string
  planCode: string
  planName: string
  subscriptionStatus: string
  entitlements: readonly FeatureEntitlement[]
}

type EntitlementRow = {
  plan_code: string
  plan_name: string
  subscription_status: string
  entitlements: unknown
}

export class EntitlementError extends Error {
  readonly code = 'FEATURE_NOT_INCLUDED'
  readonly status = 403
  readonly feature: FeatureEntitlement
  readonly planCode: string

  constructor(
    feature: FeatureEntitlement,
    planCode: string,
  ) {
    super(
      `Your current ${planCode} plan does not include ${feature}. Upgrade your plan to use this feature.`,
    )
    this.name = 'EntitlementError'
    this.feature = feature
    this.planCode = planCode
  }
}

function normalizeEntitlements(
  value: unknown,
): FeatureEntitlement[] {
  if (!Array.isArray(value)) {
    return []
  }

  const valid = new Set<string>(FEATURE_ENTITLEMENTS)

  return Array.from(
    new Set(
      value.filter(
        (item): item is FeatureEntitlement =>
          typeof item === 'string' && valid.has(item),
      ),
    ),
  )
}

async function loadEntitlements(
  organizationId: string,
): Promise<EntitlementSnapshot> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'organization_entitlements',
    {
      target_org: organizationId,
    },
  )

  if (error) {
    throw new Error(
      `Failed to load feature entitlements: ${error.message}`,
    )
  }

  const row = Array.isArray(data)
    ? (data[0] as EntitlementRow | undefined)
    : (data as EntitlementRow | null)

  if (!row) {
    throw new Error(
      `No feature entitlements were found for organization ${organizationId}.`,
    )
  }

  return {
    organizationId,
    planCode: row.plan_code,
    planName: row.plan_name,
    subscriptionStatus: row.subscription_status,
    entitlements: normalizeEntitlements(row.entitlements),
  }
}

export const getCurrentEntitlements = cache(
  async (): Promise<EntitlementSnapshot | null> => {
    const organization = await getCurrentOrganization()

    if (!organization) {
      return null
    }

    return loadEntitlements(
      organization.organization_id,
    )
  },
)

export function hasEntitlement(
  snapshot: EntitlementSnapshot,
  feature: FeatureEntitlement,
): boolean {
  return snapshot.entitlements.includes(feature)
}

export async function assertEntitlement(
  feature: FeatureEntitlement,
  organizationId?: string,
): Promise<EntitlementSnapshot> {
  let snapshot: EntitlementSnapshot | null

  if (organizationId) {
    snapshot = await loadEntitlements(organizationId)
  } else {
    snapshot = await getCurrentEntitlements()
  }

  if (!snapshot) {
    throw new Error(
      'The current organization could not be determined.',
    )
  }

  if (!hasEntitlement(snapshot, feature)) {
    throw new EntitlementError(
      feature,
      snapshot.planName,
    )
  }

  return snapshot
}

export function isEntitlementError(
  error: unknown,
): error is EntitlementError {
  return error instanceof EntitlementError
}
