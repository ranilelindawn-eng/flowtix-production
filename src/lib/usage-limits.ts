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

export const getUsageSnapshot = cache(
  async (): Promise<UsageSnapshot | null> => {
    const membership = await getCurrentOrganization()

    if (!membership) {
      return null
    }

    const supabase = await createClient()

    const [limitsResult, usageResult] = await Promise.all([
      supabase.rpc('organization_plan_limits', {
        target_org: membership.organization_id,
      }),
      supabase.rpc('organization_usage', {
        target_org: membership.organization_id,
      }),
    ])

    if (limitsResult.error) {
      throw new Error(
        `Failed to load plan limits: ${limitsResult.error.message}`
      )
    }

    if (usageResult.error) {
      throw new Error(`Failed to load usage: ${usageResult.error.message}`)
    }

    const limits = firstRow(
      limitsResult.data as LimitsRow[] | LimitsRow | null
    )

    const usage = firstRow(
      usageResult.data as UsageRow[] | UsageRow | null
    )

    if (!limits || !usage) {
      return null
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
)

export async function assertContactCapacity(): Promise<void> {
  const usage = await getUsageSnapshot()

  if (!usage) {
    throw new Error('Usage information could not be loaded.')
  }

  if (
    usage.contacts.limit !== null &&
    usage.contacts.used >= usage.contacts.limit
  ) {
    throw new Error(
      `Contact limit reached (${usage.contacts.used}/${usage.contacts.limit}). Upgrade your plan to add more contacts.`
    )
  }
}

export async function assertMemberCapacity(): Promise<void> {
  const usage = await getUsageSnapshot()

  if (!usage) {
    throw new Error('Usage information could not be loaded.')
  }

  if (
    usage.members.limit !== null &&
    usage.members.used >= usage.members.limit
  ) {
    throw new Error(
      `Team limit reached (${usage.members.used}/${usage.members.limit}). Upgrade your plan or revoke a pending invitation.`
    )
  }
}