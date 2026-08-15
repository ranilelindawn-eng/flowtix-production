import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { normalizeReportRange, type ReportRange } from '@/lib/reports'
import type {
  SalesAnalyticsOverview,
  SalesAnalyticsSnapshot,
  SalesForecastMetric,
  SalesOwnerMetric,
  SalesSourceMetric,
  SalesStageMetric,
  SalesTrendPoint,
} from './types'

type DbRow = Record<string, unknown>

type StoredSnapshotRow = {
  id: string
  period: ReportRange
  period_start: string
  period_end: string
  captured_at: string
  currency_code: string
  created_deals: number | string
  open_deals: number | string
  won_deals: number | string
  lost_deals: number | string
  pipeline_value: number | string
  weighted_pipeline_value: number | string
  won_revenue: number | string
  average_deal_size: number | string
  win_rate: number | string
  average_sales_cycle_days: number | string
  stale_deals: number | string
  overdue_next_steps: number | string
  stage_metrics: unknown
  owner_metrics: unknown
  source_metrics: unknown
  forecast_metrics: unknown
  trend_metrics: unknown
}

const SALES_ANALYTICS_MAX_SNAPSHOT_AGE_MS = 15 * 60 * 1000

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asNullableString(value: unknown): string | null {
  const result = asString(value)
  return result || null
}

function getRangeDays(period: ReportRange): number {
  if (period === '7d') return 7
  if (period === '90d') return 90
  if (period === '365d') return 365
  return 30
}

function dateDifferenceDays(start: unknown, end: Date): number {
  const date = new Date(asString(start))
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, (end.getTime() - date.getTime()) / 86_400_000)
}

function isDateInPeriod(value: unknown, start: Date, end: Date): boolean {
  const date = new Date(asString(value))
  return !Number.isNaN(date.getTime()) && date >= start && date <= end
}

function getOpportunityClosedAt(opportunity: DbRow): Date | null {
  const value =
    asString(opportunity.closed_at) ||
    asString(opportunity.won_at) ||
    asString(opportunity.lost_at) ||
    asString(opportunity.updated_at)
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function mapStoredSnapshot(row: StoredSnapshotRow): SalesAnalyticsSnapshot {
  return {
    id: row.id,
    period: row.period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    capturedAt: row.captured_at,
    currencyCode: row.currency_code,
    createdDeals: asNumber(row.created_deals),
    openDeals: asNumber(row.open_deals),
    wonDeals: asNumber(row.won_deals),
    lostDeals: asNumber(row.lost_deals),
    pipelineValue: asNumber(row.pipeline_value),
    weightedPipelineValue: asNumber(row.weighted_pipeline_value),
    wonRevenue: asNumber(row.won_revenue),
    averageDealSize: asNumber(row.average_deal_size),
    winRate: asNumber(row.win_rate),
    averageSalesCycleDays: asNumber(row.average_sales_cycle_days),
    staleDeals: asNumber(row.stale_deals),
    overdueNextSteps: asNumber(row.overdue_next_steps),
    stages: parseJsonArray<SalesStageMetric>(row.stage_metrics),
    owners: parseJsonArray<SalesOwnerMetric>(row.owner_metrics),
    sources: parseJsonArray<SalesSourceMetric>(row.source_metrics),
    forecasts: parseJsonArray<SalesForecastMetric>(row.forecast_metrics),
    trend: parseJsonArray<SalesTrendPoint>(row.trend_metrics),
  }
}

function buildTrend(period: ReportRange, end: Date): SalesTrendPoint[] {
  const days = getRangeDays(period)
  const formatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (days - index - 1))
    const key = date.toISOString().slice(0, 10)
    return { date: key, label: formatter.format(date), createdDeals: 0, wonDeals: 0, lostDeals: 0, wonRevenue: 0 }
  })
}

export function normalizeSalesAnalyticsPeriod(value: string | undefined): ReportRange {
  return normalizeReportRange(value)
}

export async function collectSalesAnalyticsSnapshot(period: ReportRange): Promise<SalesAnalyticsSnapshot> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - getRangeDays(period) + 1)
  start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString()
  const organizationId = membership.organization_id

  const [opportunitiesResult, stagesResult, pipelinesResult, membersResult, profilesResult] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id,name,pipeline_id,stage_id,status,value,currency,probability,source,forecast_category,owner_id,owner_membership_id,created_by,created_at,updated_at,stage_entered_at,won_at,lost_at,closed_at,next_step_due_at')
      .eq('organization_id', organizationId),
    supabase
      .from('pipeline_stages')
      .select('id,name,stage_type,position,target_days')
      .eq('organization_id', organizationId),
    supabase
      .from('pipelines')
      .select('id,currency_code,stale_after_days,status')
      .eq('organization_id', organizationId),
    supabase
      .from('organization_members')
      .select('id,user_id,role,status')
      .eq('organization_id', organizationId),
    supabase.from('profiles').select('id,full_name,email'),
  ])

  const firstError = [opportunitiesResult, stagesResult, pipelinesResult, membersResult, profilesResult]
    .find((result) => result.error)?.error
  if (firstError) throw new Error(`Unable to collect sales analytics: ${firstError.message}`)

  const opportunities = (opportunitiesResult.data ?? []) as DbRow[]
  const stages = (stagesResult.data ?? []) as DbRow[]
  const pipelines = (pipelinesResult.data ?? []) as DbRow[]
  const members = (membersResult.data ?? []) as DbRow[]
  const profiles = (profilesResult.data ?? []) as DbRow[]

  const stagesById = new Map(stages.map((row) => [asString(row.id), row]))
  const pipelinesById = new Map(pipelines.map((row) => [asString(row.id), row]))
  const profilesById = new Map(profiles.map((row) => [asString(row.id), row]))
  const membersById = new Map(members.map((row) => [asString(row.id), row]))
  const memberByUserId = new Map(members.map((row) => [asString(row.user_id), row]))

  const activePipelines = pipelines.filter((row) => asString(row.status) !== 'archived')
  const currencyCode = asString(activePipelines[0]?.currency_code) || 'USD'
  const trend = buildTrend(period, now)
  const trendByDate = new Map(trend.map((point) => [point.date, point]))
  const stageMap = new Map<string, SalesStageMetric & { ageTotal: number; stageAgeTotal: number }>()
  const ownerMap = new Map<string, SalesOwnerMetric>()
  const sourceMap = new Map<string, SalesSourceMetric>()
  const forecastMap = new Map<string, SalesForecastMetric>()

  let createdDeals = 0
  let openDeals = 0
  let wonDeals = 0
  let lostDeals = 0
  let pipelineValue = 0
  let weightedPipelineValue = 0
  let wonRevenue = 0
  let salesCycleTotal = 0
  let salesCycleCount = 0
  let staleDeals = 0
  let overdueNextSteps = 0

  for (const opportunity of opportunities) {
    const status = asString(opportunity.status).toLowerCase()
    const value = asNumber(opportunity.value)
    const probability = Math.min(100, Math.max(0, asNumber(opportunity.probability)))
    const createdAt = new Date(asString(opportunity.created_at))
    const createdInPeriod = !Number.isNaN(createdAt.getTime()) && createdAt >= start && createdAt <= now
    const wonDateValue = asString(opportunity.won_at) || asString(opportunity.closed_at) || asString(opportunity.updated_at)
    const lostDateValue = asString(opportunity.lost_at) || asString(opportunity.closed_at) || asString(opportunity.updated_at)
    const wonInPeriod = status === 'won' && isDateInPeriod(wonDateValue, start, now)
    const lostInPeriod = status === 'lost' && isDateInPeriod(lostDateValue, start, now)
    if (createdInPeriod) {
      createdDeals += 1
      const point = trendByDate.get(createdAt.toISOString().slice(0, 10))
      if (point) point.createdDeals += 1
    }

    if (status === 'won') {
      const wonDate = new Date(wonDateValue)
      if (wonInPeriod) {
        wonDeals += 1
        wonRevenue += value
        const point = trendByDate.get(wonDate.toISOString().slice(0, 10))
        if (point) {
          point.wonDeals += 1
          point.wonRevenue += value
        }
        if (!Number.isNaN(createdAt.getTime())) {
          salesCycleTotal += dateDifferenceDays(createdAt.toISOString(), wonDate)
          salesCycleCount += 1
        }
      }
    } else if (status === 'lost') {
      const lostDate = new Date(lostDateValue)
      if (lostInPeriod) {
        lostDeals += 1
        const point = trendByDate.get(lostDate.toISOString().slice(0, 10))
        if (point) point.lostDeals += 1
      }
    } else {
      openDeals += 1
      pipelineValue += value
      weightedPipelineValue += value * (probability / 100)
      const pipeline = pipelinesById.get(asString(opportunity.pipeline_id))
      const staleThreshold = asNumber(pipeline?.stale_after_days)
      const stageAge = dateDifferenceDays(opportunity.stage_entered_at || opportunity.updated_at, now)
      if (staleThreshold > 0 && stageAge > staleThreshold) staleDeals += 1
      const nextStepDate = new Date(asString(opportunity.next_step_due_at))
      if (!Number.isNaN(nextStepDate.getTime()) && nextStepDate < now) overdueNextSteps += 1
    }

    const stageId = asString(opportunity.stage_id)
    const stage = stagesById.get(stageId)
    const stageKey = stageId || 'unassigned'
    const stageMetric = stageMap.get(stageKey) ?? {
      stageId: stageId || null,
      stageName: asString(stage?.name) || 'Unassigned',
      stageType: (['won', 'lost'].includes(asString(stage?.stage_type)) ? asString(stage?.stage_type) : 'open') as 'open' | 'won' | 'lost',
      position: asNumber(stage?.position),
      dealCount: 0,
      totalValue: 0,
      weightedValue: 0,
      averageAgeDays: 0,
      averageDaysInStage: 0,
      ageTotal: 0,
      stageAgeTotal: 0,
    }
    stageMetric.dealCount += 1
    stageMetric.totalValue += value
    stageMetric.weightedValue += value * (probability / 100)
    const stageAgeEnd = status === 'won' || status === 'lost'
      ? (getOpportunityClosedAt(opportunity) ?? now)
      : now
    stageMetric.ageTotal += dateDifferenceDays(opportunity.created_at, stageAgeEnd)
    stageMetric.stageAgeTotal += dateDifferenceDays(opportunity.stage_entered_at || opportunity.updated_at, stageAgeEnd)
    stageMap.set(stageKey, stageMetric)

    const membershipId = asNullableString(opportunity.owner_membership_id)
    const ownerUserId = asNullableString(opportunity.owner_id) ?? asNullableString(opportunity.created_by)
    const member = (membershipId ? membersById.get(membershipId) : undefined) ?? (ownerUserId ? memberByUserId.get(ownerUserId) : undefined)
    const userId = asNullableString(member?.user_id) ?? ownerUserId
    const profile = userId ? profilesById.get(userId) : undefined
    const ownerKey = membershipId ?? userId ?? 'unassigned'
    const owner = ownerMap.get(ownerKey) ?? {
      membershipId: membershipId ?? asNullableString(member?.id),
      userId,
      name: asString(profile?.full_name) || asString(profile?.email) || 'Unassigned',
      openDeals: 0,
      wonDeals: 0,
      lostDeals: 0,
      pipelineValue: 0,
      weightedValue: 0,
      wonRevenue: 0,
      conversionRate: 0,
      averageDealSize: 0,
    }
    if (status === 'won') {
      if (wonInPeriod) {
        owner.wonDeals += 1
        owner.wonRevenue += value
      }
    } else if (status === 'lost') {
      if (lostInPeriod) owner.lostDeals += 1
    } else {
      owner.openDeals += 1
      owner.pipelineValue += value
      owner.weightedValue += value * (probability / 100)
    }
    ownerMap.set(ownerKey, owner)

    const source = asString(opportunity.source) || 'Unspecified'
    const sourceMetric = sourceMap.get(source) ?? { source, dealCount: 0, pipelineValue: 0, wonRevenue: 0 }
    sourceMetric.dealCount += 1
    if (status === 'won' && wonInPeriod) sourceMetric.wonRevenue += value
    else if (status !== 'lost' && status !== 'won') sourceMetric.pipelineValue += value
    sourceMap.set(source, sourceMetric)

    if (status !== 'won' && status !== 'lost') {
      const category = asString(opportunity.forecast_category) || 'pipeline'
      const forecast = forecastMap.get(category) ?? { category, dealCount: 0, totalValue: 0, weightedValue: 0 }
      forecast.dealCount += 1
      forecast.totalValue += value
      forecast.weightedValue += value * (probability / 100)
      forecastMap.set(category, forecast)
    }
  }

  const stagesResultMetrics: SalesStageMetric[] = [...stageMap.values()]
    .map(({ ageTotal, stageAgeTotal, ...metric }) => ({
      ...metric,
      averageAgeDays: metric.dealCount > 0 ? ageTotal / metric.dealCount : 0,
      averageDaysInStage: metric.dealCount > 0 ? stageAgeTotal / metric.dealCount : 0,
    }))
    .sort((a, b) => a.position - b.position)

  const owners: SalesOwnerMetric[] = [...ownerMap.values()]
    .map((owner) => {
      const closedDeals = owner.wonDeals + owner.lostDeals
      return {
        ...owner,
        conversionRate: closedDeals > 0 ? (owner.wonDeals / closedDeals) * 100 : 0,
        averageDealSize: owner.wonDeals > 0 ? owner.wonRevenue / owner.wonDeals : 0,
      }
    })
    .sort((a, b) => b.wonRevenue - a.wonRevenue || b.pipelineValue - a.pipelineValue)

  const closedDeals = wonDeals + lostDeals
  const snapshotPayload = {
    organization_id: organizationId,
    period,
    period_start: startIso,
    period_end: now.toISOString(),
    currency_code: currencyCode,
    created_deals: createdDeals,
    open_deals: openDeals,
    won_deals: wonDeals,
    lost_deals: lostDeals,
    pipeline_value: pipelineValue,
    weighted_pipeline_value: weightedPipelineValue,
    won_revenue: wonRevenue,
    average_deal_size: wonDeals > 0 ? wonRevenue / wonDeals : 0,
    win_rate: closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0,
    average_sales_cycle_days: salesCycleCount > 0 ? salesCycleTotal / salesCycleCount : 0,
    stale_deals: staleDeals,
    overdue_next_steps: overdueNextSteps,
    stage_metrics: stagesResultMetrics,
    owner_metrics: owners,
    source_metrics: [...sourceMap.values()].sort((a, b) => b.dealCount - a.dealCount),
    forecast_metrics: [...forecastMap.values()].sort((a, b) => b.totalValue - a.totalValue),
    trend_metrics: trend,
    captured_by: membership.user_id,
  }

  const { data, error } = await supabase
    .from('sales_analytics_snapshots')
    .insert(snapshotPayload)
    .select('*')
    .single()
  if (error) throw new Error(`Unable to store sales analytics snapshot: ${error.message}`)
  return mapStoredSnapshot(data as StoredSnapshotRow)
}

export async function getSalesAnalyticsOverview(period: ReportRange, collectWhenMissing = true): Promise<SalesAnalyticsOverview> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales_analytics_snapshots')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .eq('period', period)
    .order('captured_at', { ascending: false })
    .limit(12)
  if (error) throw new Error(`Unable to load sales analytics: ${error.message}`)
  const rows = (data ?? []) as StoredSnapshotRow[]
  if (rows.length === 0 && collectWhenMissing) {
    const snapshot = await collectSalesAnalyticsSnapshot(period)
    return { snapshot, history: [{ id: snapshot.id, period: snapshot.period, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, capturedAt: snapshot.capturedAt }] }
  }
  if (rows.length === 0) throw new Error('No sales analytics snapshot is available.')

  const latestCapturedAt = new Date(rows[0].captured_at).getTime()
  const latestIsStale =
    !Number.isFinite(latestCapturedAt) ||
    Date.now() - latestCapturedAt >= SALES_ANALYTICS_MAX_SNAPSHOT_AGE_MS

  if (collectWhenMissing && latestIsStale) {
    const snapshot = await collectSalesAnalyticsSnapshot(period)
    const priorHistory = rows.slice(0, 11).map((row) => ({
      id: row.id,
      period: row.period,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      capturedAt: row.captured_at,
    }))
    return {
      snapshot,
      history: [
        { id: snapshot.id, period: snapshot.period, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, capturedAt: snapshot.capturedAt },
        ...priorHistory,
      ],
    }
  }

  return {
    snapshot: mapStoredSnapshot(rows[0]),
    history: rows.map((row) => ({ id: row.id, period: row.period, periodStart: row.period_start, periodEnd: row.period_end, capturedAt: row.captured_at })),
  }
}
