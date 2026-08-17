import 'server-only'

import {
  FEATURE_ENTITLEMENTS,
  FLOWTIX_PLAN_ORDER,
  FLOWTIX_PLANS,
  type FeatureEntitlement,
  type PlanCode,
} from '@/lib/plans/catalog'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

type RawPlanRow = {
  code: string
  name: string
  billingProvider: string
  monthlyPriceCents: number | null
  publicPriceUsdCents: number | null
  sortOrder: number | null
  isPublic: boolean
  isActive: boolean
  maxMembers: number | null
  maxContacts: number | null
  maxStorageBytes: number | null
  maxAiRequestsPerMonth: number | null
  maxActiveCampaigns: number | null
  maxActiveSequences: number | null
  recordingRetentionDays: number | null
  maxTranscriptionMinutesPerMonth: number | null
  entitlements: string[]
}

export type PlanAcceptanceIssue = {
  key: string
  severity: 'warning' | 'critical'
  count: number
  message: string
}

export type PlanAcceptancePlan = {
  code: PlanCode
  name: string
  healthy: boolean
  selfService: boolean
  publicPriceUsdCents: number
  paymongoAmountCents: number | null
  entitlementCount: number
  issues: string[]
}

export type PlanAcceptanceScenario = {
  key: string
  label: string
  detail: string
}

export type PlanAcceptanceReport = {
  healthy: boolean
  score: number
  checkedAt: string
  plans: PlanAcceptancePlan[]
  subscriptions: {
    total: number
    nonPayMongo: number
    invalidCurrentPlan: number
    orphanPendingPlan: number
    orphanScheduledPlan: number
    expiredTrialing: number
    invalidTrialBillingState: number
    invalidScheduledDowngrade: number
    invalidActiveUpgradeTarget: number
    pendingWithoutCheckoutOrLease: number
    expiredPendingCheckout: number
    cancelledWithPendingState: number
    activeEnterprise: number
  }
  lifecycle: {
    trialPlanChanges: number
    planChangesScheduled: number
    planChangesCancelled: number
    planChangesApplied: number
    paidEvents: number
    failedPaymentEvents: number
    cancellationsScheduled: number
    cancellationsRevoked: number
  }
  issues: PlanAcceptanceIssue[]
  manualScenarios: PlanAcceptanceScenario[]
}

const FEATURE_SET = new Set<string>(FEATURE_ENTITLEMENTS)

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function parsePlan(value: unknown): RawPlanRow | null {
  if (!isRecord(value)) return null

  const code = asString(value.code)
  if (!code) return null

  return {
    code,
    name: asString(value.name),
    billingProvider: asString(value.billingProvider),
    monthlyPriceCents: asNullableNumber(value.monthlyPriceCents),
    publicPriceUsdCents: asNullableNumber(value.publicPriceUsdCents),
    sortOrder: asNullableNumber(value.sortOrder),
    isPublic: asBoolean(value.isPublic),
    isActive: asBoolean(value.isActive),
    maxMembers: asNullableNumber(value.maxMembers),
    maxContacts: asNullableNumber(value.maxContacts),
    maxStorageBytes: asNullableNumber(value.maxStorageBytes),
    maxAiRequestsPerMonth: asNullableNumber(value.maxAiRequestsPerMonth),
    maxActiveCampaigns: asNullableNumber(value.maxActiveCampaigns),
    maxActiveSequences: asNullableNumber(value.maxActiveSequences),
    recordingRetentionDays: asNullableNumber(value.recordingRetentionDays),
    maxTranscriptionMinutesPerMonth: asNullableNumber(
      value.maxTranscriptionMinutesPerMonth,
    ),
    entitlements: asStringArray(value.entitlements),
  }
}

function valuesMatch(left: number | null, right: number | null): boolean {
  return left === right
}

function sameEntitlementSet(
  actual: readonly string[],
  expected: readonly FeatureEntitlement[],
): boolean {
  if (actual.length !== expected.length) return false

  const actualSet = new Set(actual)
  if (actualSet.size !== actual.length) return false

  return expected.every((feature) => actualSet.has(feature))
}

function subscriptionSnapshot(value: unknown): PlanAcceptanceReport['subscriptions'] {
  const row = isRecord(value) ? value : {}

  return {
    total: asNumber(row.total),
    nonPayMongo: asNumber(row.nonPayMongo),
    invalidCurrentPlan: asNumber(row.invalidCurrentPlan),
    orphanPendingPlan: asNumber(row.orphanPendingPlan),
    orphanScheduledPlan: asNumber(row.orphanScheduledPlan),
    expiredTrialing: asNumber(row.expiredTrialing),
    invalidTrialBillingState: asNumber(row.invalidTrialBillingState),
    invalidScheduledDowngrade: asNumber(row.invalidScheduledDowngrade),
    invalidActiveUpgradeTarget: asNumber(row.invalidActiveUpgradeTarget),
    pendingWithoutCheckoutOrLease: asNumber(row.pendingWithoutCheckoutOrLease),
    expiredPendingCheckout: asNumber(row.expiredPendingCheckout),
    cancelledWithPendingState: asNumber(row.cancelledWithPendingState),
    activeEnterprise: asNumber(row.activeEnterprise),
  }
}

function lifecycleSnapshot(value: unknown): PlanAcceptanceReport['lifecycle'] {
  const row = isRecord(value) ? value : {}

  return {
    trialPlanChanges: asNumber(row.trialPlanChanges),
    planChangesScheduled: asNumber(row.planChangesScheduled),
    planChangesCancelled: asNumber(row.planChangesCancelled),
    planChangesApplied: asNumber(row.planChangesApplied),
    paidEvents: asNumber(row.paidEvents),
    failedPaymentEvents: asNumber(row.failedPaymentEvents),
    cancellationsScheduled: asNumber(row.cancellationsScheduled),
    cancellationsRevoked: asNumber(row.cancellationsRevoked),
  }
}

function addIssue(
  issues: PlanAcceptanceIssue[],
  key: string,
  severity: PlanAcceptanceIssue['severity'],
  count: number,
  message: string,
) {
  if (count <= 0) return
  issues.push({ key, severity, count, message })
}

const manualScenarios: PlanAcceptanceScenario[] = [
  {
    key: 'starter',
    label: 'Starter workspace',
    detail:
      'Verify core CRM, Dialer, Live Calls, Recordings, Campaigns, Sequences, exports, and limited AI remain usable; Professional/Business pages and APIs must stay locked; enforce 2 users, 2,500 contacts, 1 active campaign, 2 active sequences, 2 GB storage, 100 AI requests, and 30-day recording access.',
  },
  {
    key: 'professional',
    label: 'Professional workspace',
    detail:
      'Verify Transcripts, Dashboards, KPI, Sales Analytics, Call Analytics, AI Workspace, AI Insights, and full automation are available; Business-only analytics, workforce, and advanced roles remain locked; enforce the Professional quotas.',
  },
  {
    key: 'business',
    label: 'Business workspace',
    detail:
      'Verify Agent Analytics, Campaign Analytics, AI Analytics, Time & Attendance, advanced roles, advanced AI, and higher automation are available together with all Professional features; enforce Business quotas.',
  },
  {
    key: 'enterprise',
    label: 'Enterprise assisted onboarding',
    detail:
      'Verify public/signup/Billing self-service cannot activate a new Enterprise workspace, direct Enterprise checkout is rejected, existing Enterprise subscriptions are preserved, and custom capacity/policy is manually confirmed before an Enterprise customer is activated.',
  },
  {
    key: 'trial-switch',
    label: 'Trial plan switching',
    detail:
      'Using a real trial workspace, switch between Starter, Professional, and Business and confirm the original trial end date is preserved and no PayMongo charge is created.',
  },
  {
    key: 'paid-upgrade',
    label: 'Paid upgrade',
    detail:
      'Using PayMongo test mode, start an upgrade from an active paid plan and confirm the old plan remains entitled while payment is pending; only a verified paid webhook may activate the higher plan.',
  },
  {
    key: 'paid-downgrade',
    label: 'Paid downgrade',
    detail:
      'Schedule a downgrade and confirm the current plan remains active until period end, the lower plan becomes effective at renewal, and existing customer data is retained while new writes/activations obey the lower quotas.',
  },
  {
    key: 'cancel-renew',
    label: 'Cancellation and renewal',
    detail:
      'Schedule and revoke cancellation, test past-due renewal, cancel/expire a pending checkout, and confirm no stale pending or scheduled plan state remains afterward.',
  },
]

export async function getPlanAcceptanceReport(): Promise<PlanAcceptanceReport> {
  await requirePlatformPermission('platform.billing.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_plan_acceptance_report',
  )

  if (error) {
    throw new Error(
      `Unable to run plan acceptance validation: ${error.message}`,
    )
  }

  if (!isRecord(data)) {
    throw new Error('Plan acceptance validation returned an invalid result.')
  }

  const rawPlans = Array.isArray(data.plans)
    ? data.plans.map(parsePlan).filter((plan): plan is RawPlanRow => plan !== null)
    : []
  const actualByCode = new Map(rawPlans.map((plan) => [plan.code, plan]))
  const planReports: PlanAcceptancePlan[] = []
  const issues: PlanAcceptanceIssue[] = []

  FLOWTIX_PLAN_ORDER.forEach((code, index) => {
    const expected = FLOWTIX_PLANS[code]
    const actual = actualByCode.get(code)
    const planIssues: string[] = []

    if (!actual) {
      planIssues.push('Canonical plan row is missing from subscription_plans.')
    } else {
      if (actual.name !== expected.name) {
        planIssues.push(`Expected plan name ${expected.name}.`)
      }
      if (actual.billingProvider !== 'paymongo') {
        planIssues.push('Billing provider must be PayMongo.')
      }
      if (!actual.isActive || !actual.isPublic) {
        planIssues.push('Canonical plan must remain active and public.')
      }
      if (actual.publicPriceUsdCents !== expected.publicPriceUsdCents) {
        planIssues.push('Public USD list price does not match the canonical catalog.')
      }
      if (actual.sortOrder !== (index + 1) * 10) {
        planIssues.push('Plan sort order does not match the canonical tier order.')
      }

      const expectedLimits = expected.limits
      const limitChecks: Array<[boolean, string]> = [
        [valuesMatch(actual.maxMembers, expectedLimits.members), 'member limit'],
        [valuesMatch(actual.maxContacts, expectedLimits.contacts), 'contact limit'],
        [valuesMatch(actual.maxStorageBytes, expectedLimits.storageBytes), 'storage limit'],
        [valuesMatch(actual.maxAiRequestsPerMonth, expectedLimits.aiRequestsPerMonth), 'AI request limit'],
        [valuesMatch(actual.maxActiveCampaigns, expectedLimits.activeCampaigns), 'active campaign limit'],
        [valuesMatch(actual.maxActiveSequences, expectedLimits.activeSequences), 'active sequence limit'],
        [valuesMatch(actual.recordingRetentionDays, expectedLimits.recordingRetentionDays), 'recording retention'],
        [valuesMatch(actual.maxTranscriptionMinutesPerMonth, expectedLimits.transcriptionMinutesPerMonth), 'transcription limit'],
      ]

      for (const [matches, label] of limitChecks) {
        if (!matches) {
          planIssues.push(`Canonical ${label} does not match the plan catalog.`)
        }
      }

      const unknownEntitlements = actual.entitlements.filter(
        (feature) => !FEATURE_SET.has(feature),
      )
      if (unknownEntitlements.length > 0) {
        planIssues.push(
          `Unknown entitlement keys: ${unknownEntitlements.join(', ')}.`,
        )
      }

      if (!sameEntitlementSet(actual.entitlements, expected.entitlements)) {
        planIssues.push('Persisted entitlement set does not match the canonical catalog.')
      }
    }

    if (planIssues.length > 0) {
      addIssue(
        issues,
        `plan_${code}_mismatch`,
        'critical',
        1,
        `${expected.name} plan configuration does not match the canonical Flowtix catalog.`,
      )
    }

    planReports.push({
      code,
      name: expected.name,
      healthy: planIssues.length === 0,
      selfService: expected.selfService,
      publicPriceUsdCents: expected.publicPriceUsdCents,
      paymongoAmountCents: actual?.monthlyPriceCents ?? null,
      entitlementCount: actual?.entitlements.length ?? 0,
      issues: planIssues,
    })
  })

  addIssue(
    issues,
    'unexpected_public_paymongo_plans',
    'critical',
    asNumber(data.unexpectedPublicPlans),
    'Unexpected active/public PayMongo plan rows exist outside Starter, Professional, Business, and Enterprise.',
  )

  const subscriptions = subscriptionSnapshot(data.subscriptions)
  const lifecycle = lifecycleSnapshot(data.lifecycle)

  addIssue(issues, 'non_paymongo_subscriptions', 'critical', subscriptions.nonPayMongo, 'Subscription rows exist outside the PayMongo-only billing model.')
  addIssue(issues, 'invalid_current_plan', 'critical', subscriptions.invalidCurrentPlan, 'Subscription rows reference a missing or non-canonical current plan.')
  addIssue(issues, 'orphan_pending_plan', 'critical', subscriptions.orphanPendingPlan, 'Pending plan references cannot be resolved.')
  addIssue(issues, 'orphan_scheduled_plan', 'critical', subscriptions.orphanScheduledPlan, 'Scheduled plan references cannot be resolved.')
  addIssue(issues, 'expired_trialing', 'warning', subscriptions.expiredTrialing, 'Expired trials are still stored as trialing and require the normal trial-maintenance pass.')
  addIssue(issues, 'invalid_trial_billing_state', 'critical', subscriptions.invalidTrialBillingState, 'Active trials contain pending PayMongo state or an invalid trial payment status.')
  addIssue(issues, 'invalid_scheduled_downgrade', 'critical', subscriptions.invalidScheduledDowngrade, 'Scheduled downgrade state conflicts with the current paid period or tier order.')
  addIssue(issues, 'invalid_active_upgrade_target', 'critical', subscriptions.invalidActiveUpgradeTarget, 'An active paid subscription has a pending plan that is not a higher tier.')
  addIssue(issues, 'pending_without_checkout_or_lease', 'warning', subscriptions.pendingWithoutCheckoutOrLease, 'Pending plan state exists without a live PayMongo checkout or checkout-creation lease.')
  addIssue(issues, 'expired_pending_checkout', 'warning', subscriptions.expiredPendingCheckout, 'Expired pending PayMongo checkouts are waiting for normal maintenance cleanup.')
  addIssue(issues, 'cancelled_with_pending_state', 'critical', subscriptions.cancelledWithPendingState, 'Cancelled subscriptions retain pending checkout or scheduled plan state.')

  const criticalIssues = issues.filter((issue) => issue.severity === 'critical').length
  const warningIssues = issues.filter((issue) => issue.severity === 'warning').length
  const score = Math.max(0, 100 - criticalIssues * 20 - warningIssues * 5)

  return {
    healthy: issues.length === 0,
    score,
    checkedAt:
      typeof data.checkedAt === 'string'
        ? data.checkedAt
        : new Date(0).toISOString(),
    plans: planReports,
    subscriptions,
    lifecycle,
    issues,
    manualScenarios,
  }
}
