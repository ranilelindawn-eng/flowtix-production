import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

export type PlatformSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'suspended'
  | 'cancelled'

export type PlatformSubscriptionPlan = {
  id: string
  code: string
  name: string
  monthlyPriceCents: number
  billingProvider: 'paymongo'
  isPublic: boolean
  isActive: boolean
}

export type PlatformSubscriptionSummary = {
  id: string
  organizationId: string
  organizationName: string
  organizationStatus: string
  ownerEmail: string | null
  status: string
  planId: string
  planCode: string
  planName: string
  monthlyPriceCents: number
  billingProvider: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  lastPaymentStatus: string | null
  pendingPlanCode: string | null
  scheduledPlanCode: string | null
  scheduledPlanEffectiveAt: string | null
  pendingCheckout: boolean
  updatedAt: string
}

export type PlatformSubscriptionDirectory = {
  items: PlatformSubscriptionSummary[]
  total: number
  limit: number
  offset: number
}

export type PlatformSubscriptionLifecycleEvent = {
  id: string
  eventType: string
  source: string
  previousStatus: string | null
  newStatus: string | null
  planCode: string | null
  actorUserId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type PlatformSubscriptionDetail = PlatformSubscriptionSummary & {
  providerCheckoutId: string | null
  providerPaymentId: string | null
  paymongoCheckoutId: string | null
  paymongoPaymentId: string | null
  paymentFailureCount: number
  gracePeriodEndsAt: string | null
  activatedAt: string | null
  cancelledAt: string | null
  lifecycleVersion: number
  lifecycle: PlatformSubscriptionLifecycleEvent[]
}

export type PlatformSubscriptionMetrics = {
  mrrCents: number
  arrCents: number
  active: number
  trialing: number
  pastDue: number
  pending: number
  cancelling: number
  scheduledPlanChanges: number
}

type Row = Record<string, unknown>
const record = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => typeof v === 'string' ? v : null
const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v)
  return 0
}
const bool = (v: unknown): boolean => v === true

function parseSummary(v: unknown): PlatformSubscriptionSummary | null {
  if (!record(v)) return null
  const id = str(v.id)
  const organizationId = str(v.organizationId)
  const organizationName = str(v.organizationName)
  const status = str(v.status)
  const planId = str(v.planId)
  const planCode = str(v.planCode)
  const planName = str(v.planName)
  const updatedAt = str(v.updatedAt)
  if (!id || !organizationId || !organizationName || !status || !planId || !planCode || !planName || !updatedAt) return null
  return {
    id,
    organizationId,
    organizationName,
    organizationStatus: str(v.organizationStatus) ?? 'active',
    ownerEmail: str(v.ownerEmail),
    status,
    planId,
    planCode,
    planName,
    monthlyPriceCents: num(v.monthlyPriceCents),
    billingProvider: str(v.billingProvider) ?? 'paymongo',
    currentPeriodStart: str(v.currentPeriodStart),
    currentPeriodEnd: str(v.currentPeriodEnd),
    cancelAtPeriodEnd: bool(v.cancelAtPeriodEnd),
    lastPaymentStatus: str(v.lastPaymentStatus),
    pendingPlanCode: str(v.pendingPlanCode),
    scheduledPlanCode: str(v.scheduledPlanCode),
    scheduledPlanEffectiveAt: str(v.scheduledPlanEffectiveAt),
    pendingCheckout: bool(v.pendingCheckout),
    updatedAt,
  }
}

function parseLifecycle(v: unknown): PlatformSubscriptionLifecycleEvent | null {
  if (!record(v)) return null
  const id = str(v.id)
  const eventType = str(v.eventType)
  const source = str(v.source)
  const createdAt = str(v.createdAt)
  if (!id || !eventType || !source || !createdAt) return null
  return {
    id,
    eventType,
    source,
    previousStatus: str(v.previousStatus),
    newStatus: str(v.newStatus),
    planCode: str(v.planCode),
    actorUserId: str(v.actorUserId),
    metadata: record(v.metadata) ? v.metadata : {},
    createdAt,
  }
}

export async function getPlatformSubscriptionMetrics(): Promise<PlatformSubscriptionMetrics> {
  await requirePlatformPermission('platform.dashboard.view')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_subscription_metrics')
  if (error) throw new Error(`Unable to load subscription metrics: ${error.message}`)
  const v = record(data) ? data : {}
  return {
    mrrCents: num(v.mrrCents),
    arrCents: num(v.arrCents),
    active: num(v.active),
    trialing: num(v.trialing),
    pastDue: num(v.pastDue),
    pending: num(v.pending),
    cancelling: num(v.cancelling),
    scheduledPlanChanges: num(v.scheduledPlanChanges),
  }
}

export async function getPlatformSubscriptionPlans(): Promise<PlatformSubscriptionPlan[]> {
  await requirePlatformPermission('platform.subscriptions.manage')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_subscription_plans')
  if (error) throw new Error(`Unable to load platform plans: ${error.message}`)
  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows.flatMap((v) => {
    if (!record(v)) return []
    const id = str(v.id), code = str(v.code), name = str(v.name)
    if (!id || !code || !name) return []
    return [{ id, code, name, monthlyPriceCents: num(v.monthlyPriceCents), billingProvider: 'paymongo' as const, isPublic: bool(v.isPublic), isActive: bool(v.isActive) }]
  })
}

export async function getPlatformSubscriptions(input?: {
  search?: string
  status?: string | 'all'
  planCode?: string | 'all'
  limit?: number
  offset?: number
}): Promise<PlatformSubscriptionDirectory> {
  await requirePlatformPermission('platform.subscriptions.manage')
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_subscription_directory', {
    p_search: input?.search?.trim() || null,
    p_status: !input?.status || input.status === 'all' ? null : input.status,
    p_plan_code: !input?.planCode || input.planCode === 'all' ? null : input.planCode,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(`Unable to load platform subscriptions: ${error.message}`)
  if (!record(data)) return { items: [], total: 0, limit, offset }
  const rows: unknown[] = Array.isArray(data.items) ? data.items : []
  return {
    items: rows.flatMap((v) => { const p = parseSummary(v); return p ? [p] : [] }),
    total: num(data.total),
    limit: num(data.limit) || limit,
    offset: num(data.offset),
  }
}

export async function getPlatformSubscription(subscriptionId: string): Promise<PlatformSubscriptionDetail | null> {
  await requirePlatformPermission('platform.subscriptions.manage')
  const normalized = subscriptionId.trim()
  if (!normalized) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_subscription_detail', { p_subscription_id: normalized })
  if (error) throw new Error(`Unable to load platform subscription: ${error.message}`)
  if (!record(data)) return null
  const summary = parseSummary(data)
  if (!summary) return null
  const lifecycleRows: unknown[] = Array.isArray(data.lifecycle) ? data.lifecycle : []
  return {
    ...summary,
    providerCheckoutId: str(data.providerCheckoutId),
    providerPaymentId: str(data.providerPaymentId),
    paymongoCheckoutId: str(data.paymongoCheckoutId),
    paymongoPaymentId: str(data.paymongoPaymentId),
    paymentFailureCount: num(data.paymentFailureCount),
    gracePeriodEndsAt: str(data.gracePeriodEndsAt),
    activatedAt: str(data.activatedAt),
    cancelledAt: str(data.cancelledAt),
    lifecycleVersion: num(data.lifecycleVersion),
    lifecycle: lifecycleRows.flatMap((v) => { const p = parseLifecycle(v); return p ? [p] : [] }),
  }
}
