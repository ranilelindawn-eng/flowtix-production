import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export const METERED_USAGE_KEYS = [
  'ai_requests',
  'emails',
  'sms',
  'transcription_seconds',
] as const

export const COUNT_USAGE_KEYS = [
  'members',
  'contacts',
  'calls',
  'storage',
  'phone_numbers',
  'api_keys',
  'active_campaigns',
  'active_sequences',
] as const

export type MeteredUsageKey = (typeof METERED_USAGE_KEYS)[number]
export type CountUsageKey = (typeof COUNT_USAGE_KEYS)[number]
export type UsageKey = MeteredUsageKey | CountUsageKey

type UsageBucket = {
  used: number
  limit: number | null
}

export type UsageSnapshot = {
  planCode: string
  planName: string
  subscriptionStatus: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  members: UsageBucket
  contacts: UsageBucket
  calls: UsageBucket
  storage: UsageBucket
  aiRequests: UsageBucket
  emails: UsageBucket
  sms: UsageBucket
  phoneNumbers: UsageBucket
  apiKeys: UsageBucket
}

type PlanCapacitySnapshot = {
  planCode: string
  planName: string
  subscriptionStatus: string
  members: UsageBucket
  contacts: UsageBucket
  calls: UsageBucket
  storage: UsageBucket
  phoneNumbers: UsageBucket
  apiKeys: UsageBucket
  activeCampaigns: UsageBucket
  activeSequences: UsageBucket
  transcriptionSeconds: UsageBucket
  recordingRetentionDays: number | null
}

type UsageSnapshotRow = {
  plan_code: string
  plan_name: string
  subscription_status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  members_used: number
  members_limit: number | null
  contacts_used: number
  contacts_limit: number | null
  calls_used: number
  calls_limit: number | null
  storage_used: number
  storage_limit: number | null
  ai_requests_used: number
  ai_requests_limit: number | null
  emails_used: number
  emails_limit: number | null
  sms_used: number
  sms_limit: number | null
  phone_numbers_used: number
  phone_numbers_limit: number | null
  api_keys_used: number
  api_keys_limit: number | null
}

type PlanCapacitySnapshotRow = {
  plan_code: string
  plan_name: string
  subscription_status: string
  members_used: number
  members_limit: number | null
  contacts_used: number
  contacts_limit: number | null
  calls_used: number
  calls_limit: number | null
  storage_used: number
  storage_limit: number | null
  phone_numbers_used: number
  phone_numbers_limit: number | null
  api_keys_used: number
  api_keys_limit: number | null
  active_campaigns_used: number
  active_campaigns_limit: number | null
  active_sequences_used: number
  active_sequences_limit: number | null
  transcription_seconds_used: number
  transcription_seconds_limit: number | null
  recording_retention_days: number | null
}

type ConsumeUsageRow = {
  metric: MeteredUsageKey
  used: number
  limit_value: number | null
  remaining: number | null
}

function defaultLimitMessage(
  metric: UsageKey,
  used: number,
  limit: number,
): string {
  switch (metric) {
    case 'members':
      return `Team member limit reached (${used}/${limit}). Upgrade your plan to add another user.`
    case 'contacts':
      return `Contact limit reached (${used.toLocaleString()}/${limit.toLocaleString()}). Upgrade your plan to add more contacts.`
    case 'active_campaigns':
      return `Active campaign limit reached (${used}/${limit}). Pause or complete a campaign, or upgrade your plan.`
    case 'active_sequences':
      return `Active sequence limit reached (${used}/${limit}). Pause or archive a sequence, or upgrade your plan.`
    case 'storage':
      return `Storage limit reached. Free storage or upgrade your plan before uploading more files.`
    case 'transcription_seconds': {
      const usedMinutes = Math.ceil(used / 60)
      const limitMinutes = Math.floor(limit / 60)
      return `Monthly transcription limit reached (${usedMinutes}/${limitMinutes} minutes). Upgrade your plan to transcribe more calls.`
    }
    default:
      return `${metric} limit reached (${used}/${limit}). Upgrade your plan to continue.`
  }
}

export class UsageLimitError extends Error {
  readonly code = 'USAGE_LIMIT_REACHED'
  readonly status = 402
  readonly metric: UsageKey
  readonly used: number
  readonly limit: number

  constructor(
    metric: UsageKey,
    used: number,
    limit: number,
    message?: string,
  ) {
    super(message ?? defaultLimitMessage(metric, used, limit))
    this.name = 'UsageLimitError'
    this.metric = metric
    this.used = used
    this.limit = limit
  }
}

function firstRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function resolveOrganizationId(
  organizationId?: string,
): Promise<string> {
  if (organizationId?.trim()) return organizationId.trim()

  const membership = await getCurrentOrganization()

  if (!membership) {
    throw new Error('The current organization could not be determined.')
  }

  return membership.organization_id
}

async function loadUsageSnapshot(
  organizationId: string,
): Promise<UsageSnapshot> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'organization_usage_snapshot',
    {
      target_org: organizationId,
    },
  )

  if (error) {
    throw new Error(`Failed to load usage: ${error.message}`)
  }

  const row = firstRow(
    data as UsageSnapshotRow[] | UsageSnapshotRow | null,
  )

  if (!row) {
    throw new Error(
      `No usage information was returned for organization ${organizationId}.`,
    )
  }

  return {
    planCode: row.plan_code,
    planName: row.plan_name,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    members: {
      used: numberValue(row.members_used),
      limit: nullableNumber(row.members_limit),
    },
    contacts: {
      used: numberValue(row.contacts_used),
      limit: nullableNumber(row.contacts_limit),
    },
    calls: {
      used: numberValue(row.calls_used),
      limit: nullableNumber(row.calls_limit),
    },
    storage: {
      used: numberValue(row.storage_used),
      limit: nullableNumber(row.storage_limit),
    },
    aiRequests: {
      used: numberValue(row.ai_requests_used),
      limit: nullableNumber(row.ai_requests_limit),
    },
    emails: {
      used: numberValue(row.emails_used),
      limit: nullableNumber(row.emails_limit),
    },
    sms: {
      used: numberValue(row.sms_used),
      limit: nullableNumber(row.sms_limit),
    },
    phoneNumbers: {
      used: numberValue(row.phone_numbers_used),
      limit: nullableNumber(row.phone_numbers_limit),
    },
    apiKeys: {
      used: numberValue(row.api_keys_used),
      limit: nullableNumber(row.api_keys_limit),
    },
  }
}

const loadPlanCapacitySnapshot = cache(
  async (organizationId: string): Promise<PlanCapacitySnapshot> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(
      'organization_plan_capacity_snapshot',
      {
        target_org: organizationId,
      },
    )

    if (error) {
      throw new Error(
        `Failed to load plan capacity: ${error.message}`,
      )
    }

    const row = firstRow(
      data as
        | PlanCapacitySnapshotRow[]
        | PlanCapacitySnapshotRow
        | null,
    )

    if (!row) {
      throw new Error(
        `No plan capacity information was returned for organization ${organizationId}.`,
      )
    }

    return {
      planCode: row.plan_code,
      planName: row.plan_name,
      subscriptionStatus: row.subscription_status,
      members: {
        used: numberValue(row.members_used),
        limit: nullableNumber(row.members_limit),
      },
      contacts: {
        used: numberValue(row.contacts_used),
        limit: nullableNumber(row.contacts_limit),
      },
      calls: {
        used: numberValue(row.calls_used),
        limit: nullableNumber(row.calls_limit),
      },
      storage: {
        used: numberValue(row.storage_used),
        limit: nullableNumber(row.storage_limit),
      },
      phoneNumbers: {
        used: numberValue(row.phone_numbers_used),
        limit: nullableNumber(row.phone_numbers_limit),
      },
      apiKeys: {
        used: numberValue(row.api_keys_used),
        limit: nullableNumber(row.api_keys_limit),
      },
      activeCampaigns: {
        used: numberValue(row.active_campaigns_used),
        limit: nullableNumber(row.active_campaigns_limit),
      },
      activeSequences: {
        used: numberValue(row.active_sequences_used),
        limit: nullableNumber(row.active_sequences_limit),
      },
      transcriptionSeconds: {
        used: numberValue(row.transcription_seconds_used),
        limit: nullableNumber(row.transcription_seconds_limit),
      },
      recordingRetentionDays: nullableNumber(
        row.recording_retention_days,
      ),
    }
  },
)

export const getUsageSnapshot = cache(
  async (): Promise<UsageSnapshot | null> => {
    const membership = await getCurrentOrganization()
    return membership
      ? loadUsageSnapshot(membership.organization_id)
      : null
  },
)

function assertSubscriptionAllowsUsage(snapshot: {
  subscriptionStatus: string
}): void {
  if (
    !['active', 'trialing', 'past_due'].includes(
      snapshot.subscriptionStatus,
    )
  ) {
    throw new UsageLimitError(
      'calls',
      0,
      0,
      'The workspace subscription is not active. Restore billing access to continue.',
    )
  }
}

function capacityBucketFor(
  snapshot: PlanCapacitySnapshot,
  metric: CountUsageKey,
): UsageBucket {
  switch (metric) {
    case 'members':
      return snapshot.members
    case 'contacts':
      return snapshot.contacts
    case 'calls':
      return snapshot.calls
    case 'storage':
      return snapshot.storage
    case 'phone_numbers':
      return snapshot.phoneNumbers
    case 'api_keys':
      return snapshot.apiKeys
    case 'active_campaigns':
      return snapshot.activeCampaigns
    case 'active_sequences':
      return snapshot.activeSequences
  }
}

export async function assertUsageCapacity(
  metric: CountUsageKey,
  increment = 1,
  organizationId?: string,
): Promise<PlanCapacitySnapshot> {
  if (!Number.isFinite(increment) || increment < 0) {
    throw new Error(
      'Usage increment must be a non-negative number.',
    )
  }

  const resolvedOrganizationId = await resolveOrganizationId(
    organizationId,
  )
  const snapshot = await loadPlanCapacitySnapshot(
    resolvedOrganizationId,
  )
  assertSubscriptionAllowsUsage(snapshot)
  const bucket = capacityBucketFor(snapshot, metric)

  if (
    bucket.limit !== null &&
    bucket.used + increment > bucket.limit
  ) {
    throw new UsageLimitError(metric, bucket.used, bucket.limit)
  }

  return snapshot
}

export async function consumeMeteredUsage(
  metric: MeteredUsageKey,
  units = 1,
  organizationId?: string,
  idempotencyKey?: string,
): Promise<ConsumeUsageRow> {
  if (!Number.isInteger(units) || units <= 0) {
    throw new Error('Usage units must be a positive integer.')
  }

  const resolvedOrganizationId = await resolveOrganizationId(
    organizationId,
  )
  const supabase = await createClient()

  if (metric === 'ai_requests') {
    const snapshot = await loadUsageSnapshot(resolvedOrganizationId)
    assertSubscriptionAllowsUsage(snapshot)

    const key =
      idempotencyKey?.trim() || `ai:${crypto.randomUUID()}`
    const feature =
      key
        .split(':')
        .slice(0, 3)
        .join('.')
        .replace(/^ai\./, '') || 'unknown'
    const { data: reservation, error: reservationError } =
      await supabase.rpc('reserve_ai_usage', {
        target_org: resolvedOrganizationId,
        usage_feature: feature,
        usage_idempotency_key: key,
        estimated_input: 0,
        estimated_output: 0,
        reservation_seconds: 900,
      })

    if (reservationError) {
      if (
        reservationError.message.includes('AI_') ||
        reservationError.message.includes('USAGE_LIMIT_REACHED')
      ) {
        const refreshedSnapshot = await loadUsageSnapshot(
          resolvedOrganizationId,
        )
        const bucket = refreshedSnapshot.aiRequests
        throw new UsageLimitError(
          metric,
          bucket.used,
          bucket.limit ?? bucket.used,
          reservationError.message,
        )
      }

      throw new Error(
        `Unable to consume ${metric} usage: ${reservationError.message}`,
      )
    }

    const reservationRow = reservation as { id?: string } | null

    if (reservationRow?.id) {
      const { error: finalizeError } = await supabase.rpc(
        'finalize_ai_usage',
        {
          reservation_id: reservationRow.id,
          result_status: 'completed',
          result_provider: null,
          result_model: null,
          actual_input_tokens: null,
          actual_output_tokens: null,
          result_cost_micros: null,
          result_request_id: null,
          result_latency_ms: null,
          result_error_code: null,
          result_error_message: null,
          result_metadata: {
            source: 'legacy_metered_usage',
          },
        },
      )

      if (finalizeError) {
        throw new Error(
          `Unable to finalize ${metric} usage: ${finalizeError.message}`,
        )
      }
    }

    return {
      metric,
      used: 0,
      limit_value: null,
      remaining: null,
    }
  }

  if (metric === 'transcription_seconds') {
    const capacitySnapshot = await loadPlanCapacitySnapshot(
      resolvedOrganizationId,
    )
    assertSubscriptionAllowsUsage(capacitySnapshot)
  } else {
    const snapshot = await loadUsageSnapshot(resolvedOrganizationId)
    assertSubscriptionAllowsUsage(snapshot)
  }

  const { data, error } = await supabase.rpc(
    'consume_organization_usage',
    {
      target_org: resolvedOrganizationId,
      usage_metric: metric,
      usage_units: units,
      usage_idempotency_key: idempotencyKey?.trim() || null,
    },
  )

  if (error) {
    if (error.message.includes('USAGE_LIMIT_REACHED')) {
      if (metric === 'transcription_seconds') {
        const capacitySnapshot = await loadPlanCapacitySnapshot(
          resolvedOrganizationId,
        )
        const bucket = capacitySnapshot.transcriptionSeconds

        if (bucket.limit !== null) {
          throw new UsageLimitError(
            metric,
            bucket.used,
            bucket.limit,
          )
        }
      } else {
        const snapshot = await loadUsageSnapshot(
          resolvedOrganizationId,
        )
        const bucket =
          metric === 'emails' ? snapshot.emails : snapshot.sms

        if (bucket.limit !== null) {
          throw new UsageLimitError(
            metric,
            bucket.used,
            bucket.limit,
          )
        }
      }
    }

    throw new Error(
      `Unable to consume ${metric} usage: ${error.message}`,
    )
  }

  const row = firstRow(
    data as ConsumeUsageRow[] | ConsumeUsageRow | null,
  )

  if (!row) {
    throw new Error(`No usage result was returned for ${metric}.`)
  }

  return row
}

export async function assertContactCapacity(
  organizationId?: string,
  increment = 1,
): Promise<void> {
  await assertUsageCapacity('contacts', increment, organizationId)
}

export async function assertMemberCapacity(
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('members', 1, organizationId)
}

export async function assertCallCapacity(
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('calls', 1, organizationId)
}

export async function assertStorageCapacity(
  bytes: number,
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('storage', bytes, organizationId)
}

export async function assertPhoneNumberCapacity(
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('phone_numbers', 1, organizationId)
}

export async function assertApiKeyCapacity(
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('api_keys', 1, organizationId)
}

export async function assertActiveCampaignCapacity(
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('active_campaigns', 1, organizationId)
}

export async function assertActiveSequenceCapacity(
  organizationId?: string,
): Promise<void> {
  await assertUsageCapacity('active_sequences', 1, organizationId)
}

export async function consumeTranscriptionSeconds(
  seconds: number,
  organizationId?: string,
  idempotencyKey?: string,
): Promise<void> {
  const normalizedSeconds = Math.ceil(seconds)

  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
    throw new Error(
      'Transcription duration must be a positive number of seconds.',
    )
  }

  await consumeMeteredUsage(
    'transcription_seconds',
    normalizedSeconds,
    organizationId,
    idempotencyKey,
  )
}

export async function getRecordingRetentionCutoff(
  organizationId?: string,
): Promise<string | null> {
  const resolvedOrganizationId = await resolveOrganizationId(
    organizationId,
  )
  const snapshot = await loadPlanCapacitySnapshot(
    resolvedOrganizationId,
  )
  assertSubscriptionAllowsUsage(snapshot)

  if (snapshot.recordingRetentionDays === null) {
    return null
  }

  const cutoff = new Date()
  cutoff.setUTCDate(
    cutoff.getUTCDate() - snapshot.recordingRetentionDays,
  )

  return cutoff.toISOString()
}

export function isUsageLimitError(
  error: unknown,
): error is UsageLimitError {
  return error instanceof UsageLimitError
}
