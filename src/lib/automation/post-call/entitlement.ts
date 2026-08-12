import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { NonRetryableJobError } from '@/lib/jobs/types'

type EntitlementRow = {
  plan_code: string
  plan_name: string
  subscription_status: string
  entitlements: unknown
}

type NormalizedEntitlement = {
  planCode: string
  planName: string
  subscriptionStatus: string
  entitlements: string[]
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service-role configuration for post-call entitlement enforcement.',
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function firstEntitlementRow(value: unknown): EntitlementRow | null {
  const candidate = Array.isArray(value) ? value[0] : value

  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const row = candidate as Record<string, unknown>

  if (
    typeof row.plan_code !== 'string' ||
    typeof row.plan_name !== 'string' ||
    typeof row.subscription_status !== 'string'
  ) {
    return null
  }

  return {
    plan_code: row.plan_code,
    plan_name: row.plan_name,
    subscription_status: row.subscription_status,
    entitlements: row.entitlements,
  }
}

async function loadOrganizationEntitlements(
  organizationId: string,
): Promise<NormalizedEntitlement> {
  const client = createServiceClient()
  const { data, error } = await client.rpc(
    'organization_entitlements',
    { target_org: organizationId },
  )

  if (error) {
    throw new Error(
      `Unable to resolve post-call automation entitlement: ${error.message}`,
    )
  }

  const row = firstEntitlementRow(data)
  if (!row) {
    throw new NonRetryableJobError(
      'No subscription entitlement record is available for this organization.',
      'POST_CALL_ENTITLEMENT_UNAVAILABLE',
    )
  }

  return {
    planCode: row.plan_code,
    planName: row.plan_name,
    subscriptionStatus: row.subscription_status,
    entitlements: Array.isArray(row.entitlements)
      ? row.entitlements.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  }
}

/**
 * Advanced automation is available only to plans that include the dedicated
 * automation.advanced entitlement. Email/SMS quantities are still enforced
 * independently during delivery.
 */
export async function assertPostCallAutomationEntitlement(
  organizationId: string,
) {
  const snapshot = await loadOrganizationEntitlements(organizationId)

  if (!snapshot.entitlements.includes('automation.advanced')) {
    throw new NonRetryableJobError(
      `The ${snapshot.planName} plan does not include advanced automation.`,
      'POST_CALL_ENTITLEMENT_REQUIRED',
    )
  }

  return snapshot
}

/**
 * AI personalization reuses Flowtix's existing AI email entitlement rather than
 * introducing a second billing/plan framework. AI execution itself is still
 * reserved and accounted through the AI usage-control system.
 */
export async function assertPostCallAIEntitlement(
  organizationId: string,
) {
  const snapshot = await loadOrganizationEntitlements(organizationId)

  if (!snapshot.entitlements.includes('ai.email')) {
    throw new NonRetryableJobError(
      `The ${snapshot.planName} plan does not include AI-generated follow-up content.`,
      'POST_CALL_AI_ENTITLEMENT_REQUIRED',
    )
  }

  return snapshot
}
