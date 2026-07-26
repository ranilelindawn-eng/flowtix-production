import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export type UsageSnapshot = {
  planCode: string
  planName: string
  subscriptionStatus: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  members: {
    used: number
    limit: number | null
  }
  contacts: {
    used: number
    limit: number | null
  }
  calls: {
    used: number
    limit: number | null
  }
  storage: {
    used: number
    limit: number | null
  }
}

type LimitsRow = {
  plan_code: string
  plan_name: string
  max_members: number | null
  max_contacts: number | null
  max_storage_bytes: number | null
  max_calls_per_month: number | null
  subscription_status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

type UsageRow = {
  members_count: number
  pending_invitations_count: number
  contacts_count: number
  calls_this_month: number
  storage_bytes: number
}

function firstRow<T>(value: T[] | T | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

async function loadUsageSnapshot(
  organizationId: string,
): Promise<UsageSnapshot> {
  const supabase = await createClient()

  const [limitsResult, usageResult] = await Promise.all([
    supabase.rpc('organization_plan_limits', {
      target_org: organizationId,
    }),
    supabase.rpc('organization_usage', {
      target_org: organizationId,
    }),
  ])

  if (limitsResult.error) {
    throw new Error(
      `Failed to load plan limits: ${limitsResult.error.message}`,
    )
  }

  if (usageResult.error) {
    throw new Error(
      `Failed to load usage: ${usageResult.error.message}`,
    )
  }

  const limits = firstRow(
    limitsResult.data as LimitsRow[] | LimitsRow | null,
  )

  const usage = firstRow(
    usageResult.data as UsageRow[] | UsageRow | null,
  )

  if (!limits) {
    throw new Error(
      `No subscription plan was found for organization ${organizationId}.`,
    )
  }

  if (!usage) {
    throw new Error(
      `No usage information was returned for organization ${organizationId}.`,
    )
  }

  return {
    planCode: limits.plan_code,
    planName: limits.plan_name,
    subscriptionStatus: limits.subscription_status,
    currentPeriodEnd: limits.current_period_end,
    cancelAtPeriodEnd: limits.cancel_at_period_end,
    members: {
      used:
        Number(usage.members_count) +
        Number(usage.pending_invitations_count),
      limit: limits.max_members,
    },
    contacts: {
      used: Number(usage.contacts_count),
      limit: limits.max_contacts,
    },
    calls: {
      used: Number(usage.calls_this_month),
      limit: limits.max_calls_per_month,
    },
    storage: {
      used: Number(usage.storage_bytes),
      limit: limits.max_storage_bytes,
    },
  }
}

export const getUsageSnapshot = cache(
  async (): Promise<UsageSnapshot | null> => {
    const membership = await getCurrentOrganization()

    if (!membership) {
      return null
    }

    return loadUsageSnapshot(
      membership.organization_id,
    )
  },
)

export async function assertContactCapacity(
  organizationId?: string,
): Promise<void> {
  let resolvedOrganizationId = organizationId

  if (!resolvedOrganizationId) {
    const membership = await getCurrentOrganization()

    resolvedOrganizationId =
      membership?.organization_id
  }

  if (!resolvedOrganizationId) {
    throw new Error(
      'The current organization could not be determined.',
    )
  }

  const usage = await loadUsageSnapshot(
    resolvedOrganizationId,
  )

  if (
    usage.contacts.limit !== null &&
    usage.contacts.used >= usage.contacts.limit
  ) {
    throw new Error(
      `Contact limit reached (${usage.contacts.used}/${usage.contacts.limit}). Upgrade your plan to add more contacts.`,
    )
  }
}

export async function assertMemberCapacity(
  organizationId?: string,
): Promise<void> {
  let resolvedOrganizationId = organizationId

  if (!resolvedOrganizationId) {
    const membership = await getCurrentOrganization()

    resolvedOrganizationId =
      membership?.organization_id
  }

  if (!resolvedOrganizationId) {
    throw new Error(
      'The current organization could not be determined.',
    )
  }

  const usage = await loadUsageSnapshot(
    resolvedOrganizationId,
  )

  if (
    usage.members.limit !== null &&
    usage.members.used >= usage.members.limit
  ) {
    throw new Error(
      `Team limit reached (${usage.members.used}/${usage.members.limit}). Upgrade your plan or revoke a pending invitation.`,
    )
  }
}