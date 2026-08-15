import { requirePermission } from '@/lib/auth'
import { normalizeReportRange, type ReportRange } from '@/lib/reports'
import { createClient } from '@/lib/supabase/server'
import type {
  CallAgentMetric,
  CallAnalyticsOverview,
  CallAnalyticsSnapshot,
  CallDirectionMetric,
  CallProviderMetric,
  CallQueueMetric,
  CallRoutingMetric,
  CallTrendPoint,
} from './types'

type DbRow = Record<string, unknown>

type StoredSnapshotRow = {
  id: string
  period: ReportRange
  period_start: string
  period_end: string
  captured_at: string
  total_calls: number | string
  inbound_calls: number | string
  outbound_calls: number | string
  connected_calls: number | string
  failed_calls: number | string
  missed_calls: number | string
  connect_rate: number | string
  total_talk_seconds: number | string
  average_duration_seconds: number | string
  average_answer_seconds: number | string
  recorded_calls: number | string
  recording_rate: number | string
  queue_entries: number | string
  queue_answered: number | string
  queue_abandoned: number | string
  queue_abandon_rate: number | string
  routing_attempts: number | string
  routing_failures: number | string
  provider_metrics: unknown
  direction_metrics: unknown
  agent_metrics: unknown
  queue_metrics: unknown
  routing_metrics: unknown
  trend_metrics: unknown
}

const connectedStatuses = new Set(['answered', 'completed', 'connected', 'in-progress', 'in_progress', 'bridged'])
const failedStatuses = new Set(['failed', 'busy', 'no-answer', 'no_answer', 'canceled', 'cancelled', 'missed'])
const missedStatuses = new Set(['busy', 'no-answer', 'no_answer', 'missed'])

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function getRangeDays(period: ReportRange): number {
  if (period === '7d') return 7
  if (period === '90d') return 90
  if (period === '365d') return 365
  return 30
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

function dateSeconds(start: unknown, end: unknown): number {
  const startDate = new Date(asString(start))
  const endDate = new Date(asString(end))
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 1000)
}

function effectiveStatus(row: DbRow): string {
  // Flowtix's canonical call lifecycle is the source of truth. Provider/raw
  // statuses are diagnostic and can contain values such as NORMAL_CLEARING
  // that should not override a canonical `completed` call. Fall back to
  // routing/provider values only for older/incomplete records without a
  // canonical status.
  const canonical = asString(row.status).toLowerCase()
  if (canonical) return canonical
  return (asString(row.routing_status) || asString(row.provider_status_raw)).toLowerCase()
}

function buildTrend(period: ReportRange, end: Date): CallTrendPoint[] {
  const days = getRangeDays(period)
  const formatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (days - index - 1))
    const key = date.toISOString().slice(0, 10)
    return {
      date: key,
      label: formatter.format(date),
      totalCalls: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      connectedCalls: 0,
      failedCalls: 0,
      talkSeconds: 0,
    }
  })
}

function mapStoredSnapshot(row: StoredSnapshotRow): CallAnalyticsSnapshot {
  return {
    id: row.id,
    period: row.period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    capturedAt: row.captured_at,
    totalCalls: asNumber(row.total_calls),
    inboundCalls: asNumber(row.inbound_calls),
    outboundCalls: asNumber(row.outbound_calls),
    connectedCalls: asNumber(row.connected_calls),
    failedCalls: asNumber(row.failed_calls),
    missedCalls: asNumber(row.missed_calls),
    connectRate: asNumber(row.connect_rate),
    totalTalkSeconds: asNumber(row.total_talk_seconds),
    averageDurationSeconds: asNumber(row.average_duration_seconds),
    averageAnswerSeconds: asNumber(row.average_answer_seconds),
    recordedCalls: asNumber(row.recorded_calls),
    recordingRate: asNumber(row.recording_rate),
    queueEntries: asNumber(row.queue_entries),
    queueAnswered: asNumber(row.queue_answered),
    queueAbandoned: asNumber(row.queue_abandoned),
    queueAbandonRate: asNumber(row.queue_abandon_rate),
    routingAttempts: asNumber(row.routing_attempts),
    routingFailures: asNumber(row.routing_failures),
    providers: parseJsonArray<CallProviderMetric>(row.provider_metrics),
    directions: parseJsonArray<CallDirectionMetric>(row.direction_metrics),
    agents: parseJsonArray<CallAgentMetric>(row.agent_metrics),
    queues: parseJsonArray<CallQueueMetric>(row.queue_metrics),
    routing: parseJsonArray<CallRoutingMetric>(row.routing_metrics),
    trend: parseJsonArray<CallTrendPoint>(row.trend_metrics),
  }
}

export function normalizeCallAnalyticsPeriod(value: string | undefined): ReportRange {
  return normalizeReportRange(value)
}

export async function collectCallAnalyticsSnapshot(period: ReportRange): Promise<CallAnalyticsSnapshot> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - getRangeDays(period) + 1)
  start.setUTCHours(0, 0, 0, 0)
  const organizationId = membership.organization_id
  const startIso = start.toISOString()
  const endIso = now.toISOString()

  const [callsResult, attemptsResult, queueEntriesResult, queuesResult, membersResult, profilesResult] = await Promise.all([
    supabase
      .from('calls')
      .select('id,direction,status,started_at,ended_at,duration_seconds,recording_available,provider,provider_status_raw,routing_status,owner_user_id,owner_membership_id,created_by')
      .eq('organization_id', organizationId)
      .gte('started_at', startIso)
      .lte('started_at', endIso),
    supabase
      .from('call_routing_attempts')
      .select('id,strategy,status,started_at,answered_at,completed_at,failure_reason')
      .eq('organization_id', organizationId)
      .gte('started_at', startIso)
      .lte('started_at', endIso),
    supabase
      .from('call_queue_entries')
      .select('id,queue_id,status,entered_at,answered_at,completed_at,abandoned_at,overflowed_at,estimated_wait_seconds')
      .eq('organization_id', organizationId)
      .gte('entered_at', startIso)
      .lte('entered_at', endIso),
    supabase.from('call_queues').select('id,name').eq('organization_id', organizationId),
    supabase.from('organization_members').select('id,user_id').eq('organization_id', organizationId),
    supabase.from('profiles').select('id,full_name,email'),
  ])

  const firstError = [callsResult, attemptsResult, queueEntriesResult, queuesResult, membersResult, profilesResult]
    .find((result) => result.error)?.error
  if (firstError) throw new Error(`Unable to collect call analytics: ${firstError.message}`)

  const calls = (callsResult.data ?? []) as DbRow[]
  const attempts = (attemptsResult.data ?? []) as DbRow[]
  const queueEntries = (queueEntriesResult.data ?? []) as DbRow[]
  const queues = (queuesResult.data ?? []) as DbRow[]
  const members = (membersResult.data ?? []) as DbRow[]
  const profiles = (profilesResult.data ?? []) as DbRow[]
  const queueNames = new Map(queues.map((row) => [asString(row.id), asString(row.name) || 'Queue']))
  const memberById = new Map(members.map((row) => [asString(row.id), row]))
  const profileById = new Map(profiles.map((row) => [asString(row.id), row]))

  const trend = buildTrend(period, now)
  const trendByDate = new Map(trend.map((point) => [point.date, point]))
  const providerMap = new Map<string, CallProviderMetric & { durationTotal: number }>()
  const directionMap = new Map<string, CallDirectionMetric>()
  const agentMap = new Map<string, CallAgentMetric & { durationTotal: number }>()

  let inboundCalls = 0
  let outboundCalls = 0
  let connectedCalls = 0
  let failedCalls = 0
  let missedCalls = 0
  let totalTalkSeconds = 0
  let recordedCalls = 0

  for (const call of calls) {
    const directionRaw = asString(call.direction).toLowerCase()
    const direction: CallDirectionMetric['direction'] = directionRaw === 'inbound' || directionRaw === 'outbound' ? directionRaw : 'unknown'
    const status = effectiveStatus(call)
    const connected = connectedStatuses.has(status) || (asNumber(call.duration_seconds) > 0 && !failedStatuses.has(status))
    const failed = failedStatuses.has(status)
    const missed = missedStatuses.has(status)
    const duration = Math.max(0, asNumber(call.duration_seconds) || dateSeconds(call.started_at, call.ended_at))
    const provider = asString(call.provider) || 'unknown'

    if (direction === 'inbound') inboundCalls += 1
    if (direction === 'outbound') outboundCalls += 1
    if (connected) connectedCalls += 1
    if (failed) failedCalls += 1
    if (missed) missedCalls += 1
    if (connected) totalTalkSeconds += duration
    if (call.recording_available === true) recordedCalls += 1

    const point = trendByDate.get(asString(call.started_at).slice(0, 10))
    if (point) {
      point.totalCalls += 1
      if (direction === 'inbound') point.inboundCalls += 1
      if (direction === 'outbound') point.outboundCalls += 1
      if (connected) point.connectedCalls += 1
      if (failed) point.failedCalls += 1
      if (connected) point.talkSeconds += duration
    }

    const providerMetric = providerMap.get(provider) ?? {
      provider,
      totalCalls: 0,
      connectedCalls: 0,
      failedCalls: 0,
      connectRate: 0,
      averageDurationSeconds: 0,
      durationTotal: 0,
    }
    providerMetric.totalCalls += 1
    if (connected) providerMetric.connectedCalls += 1
    if (failed) providerMetric.failedCalls += 1
    if (connected) providerMetric.durationTotal += duration
    providerMap.set(provider, providerMetric)

    const directionMetric = directionMap.get(direction) ?? {
      direction,
      totalCalls: 0,
      connectedCalls: 0,
      failedCalls: 0,
      connectRate: 0,
      totalTalkSeconds: 0,
    }
    directionMetric.totalCalls += 1
    if (connected) directionMetric.connectedCalls += 1
    if (failed) directionMetric.failedCalls += 1
    if (connected) directionMetric.totalTalkSeconds += duration
    directionMap.set(direction, directionMetric)

    const membershipId = asString(call.owner_membership_id) || null
    const member = membershipId ? memberById.get(membershipId) : undefined
    const userId = asString(call.owner_user_id) || asString(member?.user_id) || asString(call.created_by) || null
    const profile = userId ? profileById.get(userId) : undefined
    const name = asString(profile?.full_name) || asString(profile?.email) || 'Unassigned'
    const agentKey = membershipId || userId || 'unassigned'
    const agentMetric = agentMap.get(agentKey) ?? {
      membershipId,
      userId,
      name,
      totalCalls: 0,
      connectedCalls: 0,
      failedCalls: 0,
      connectRate: 0,
      totalTalkSeconds: 0,
      averageDurationSeconds: 0,
      durationTotal: 0,
    }
    agentMetric.totalCalls += 1
    if (connected) agentMetric.connectedCalls += 1
    if (failed) agentMetric.failedCalls += 1
    if (connected) {
      agentMetric.totalTalkSeconds += duration
      agentMetric.durationTotal += duration
    }
    agentMap.set(agentKey, agentMetric)
  }

  const providers = [...providerMap.values()].map(({ durationTotal, ...metric }) => ({
    ...metric,
    connectRate: percentage(metric.connectedCalls, metric.totalCalls),
    averageDurationSeconds: metric.connectedCalls > 0 ? durationTotal / metric.connectedCalls : 0,
  })).sort((a, b) => b.totalCalls - a.totalCalls)

  const directions = [...directionMap.values()].map((metric) => ({
    ...metric,
    connectRate: percentage(metric.connectedCalls, metric.totalCalls),
  })).sort((a, b) => b.totalCalls - a.totalCalls)

  const agents = [...agentMap.values()].map(({ durationTotal, ...metric }) => ({
    ...metric,
    connectRate: percentage(metric.connectedCalls, metric.totalCalls),
    averageDurationSeconds: metric.connectedCalls > 0 ? durationTotal / metric.connectedCalls : 0,
  })).sort((a, b) => b.connectedCalls - a.connectedCalls || b.totalCalls - a.totalCalls)

  const routingMap = new Map<string, CallRoutingMetric & { answerSecondsTotal: number; answerSecondsCount: number }>()
  let routingFailures = 0
  let answerSecondsTotal = 0
  let answerSecondsCount = 0
  for (const attempt of attempts) {
    const strategy = asString(attempt.strategy) || 'unknown'
    const status = asString(attempt.status).toLowerCase()
    const answered = status === 'answered' || status === 'completed'
    const failed = status === 'failed' || status === 'cancelled'
    const noAgents = status === 'no_agents'
    const answerSeconds = dateSeconds(attempt.started_at, attempt.answered_at)
    if (failed || noAgents) routingFailures += 1
    if (answerSeconds > 0) {
      answerSecondsTotal += answerSeconds
      answerSecondsCount += 1
    }
    const metric = routingMap.get(strategy) ?? {
      strategy,
      attempts: 0,
      answered: 0,
      failed: 0,
      noAgents: 0,
      answerRate: 0,
      averageAnswerSeconds: 0,
      answerSecondsTotal: 0,
      answerSecondsCount: 0,
    }
    metric.attempts += 1
    if (answered) metric.answered += 1
    if (failed) metric.failed += 1
    if (noAgents) metric.noAgents += 1
    if (answerSeconds > 0) {
      metric.answerSecondsTotal += answerSeconds
      metric.answerSecondsCount += 1
    }
    routingMap.set(strategy, metric)
  }
  const routing = [...routingMap.values()].map(({ answerSecondsTotal: total, answerSecondsCount: count, ...metric }) => ({
    ...metric,
    answerRate: percentage(metric.answered, metric.attempts),
    averageAnswerSeconds: count > 0 ? total / count : 0,
  })).sort((a, b) => b.attempts - a.attempts)

  const queueMap = new Map<string, CallQueueMetric & { waitTotal: number; waitCount: number }>()
  let queueAnswered = 0
  let queueAbandoned = 0
  for (const entry of queueEntries) {
    const queueId = asString(entry.queue_id)
    const status = asString(entry.status).toLowerCase()
    const answered = ['answered', 'completed'].includes(status)
    const abandoned = status === 'abandoned'
    const overflowed = status === 'overflowed'
    const wait = answered
      ? dateSeconds(entry.entered_at, entry.answered_at)
      : abandoned
        ? dateSeconds(entry.entered_at, entry.abandoned_at)
        : Math.max(0, asNumber(entry.estimated_wait_seconds))
    if (answered) queueAnswered += 1
    if (abandoned) queueAbandoned += 1
    const metric = queueMap.get(queueId) ?? {
      queueId,
      queueName: queueNames.get(queueId) ?? 'Queue',
      entered: 0,
      answered: 0,
      abandoned: 0,
      overflowed: 0,
      answerRate: 0,
      averageWaitSeconds: 0,
      longestWaitSeconds: 0,
      waitTotal: 0,
      waitCount: 0,
    }
    metric.entered += 1
    if (answered) metric.answered += 1
    if (abandoned) metric.abandoned += 1
    if (overflowed) metric.overflowed += 1
    if (wait > 0) {
      metric.waitTotal += wait
      metric.waitCount += 1
      metric.longestWaitSeconds = Math.max(metric.longestWaitSeconds, wait)
    }
    queueMap.set(queueId, metric)
  }
  const queuesMetrics = [...queueMap.values()].map(({ waitTotal, waitCount, ...metric }) => ({
    ...metric,
    answerRate: percentage(metric.answered, metric.entered),
    averageWaitSeconds: waitCount > 0 ? waitTotal / waitCount : 0,
  })).sort((a, b) => b.entered - a.entered)

  const totalCalls = calls.length
  const snapshotInsert = {
    organization_id: organizationId,
    period,
    period_start: startIso,
    period_end: endIso,
    total_calls: totalCalls,
    inbound_calls: inboundCalls,
    outbound_calls: outboundCalls,
    connected_calls: connectedCalls,
    failed_calls: failedCalls,
    missed_calls: missedCalls,
    connect_rate: percentage(connectedCalls, totalCalls),
    total_talk_seconds: Math.round(totalTalkSeconds),
    average_duration_seconds: connectedCalls > 0 ? totalTalkSeconds / connectedCalls : 0,
    average_answer_seconds: answerSecondsCount > 0 ? answerSecondsTotal / answerSecondsCount : 0,
    recorded_calls: recordedCalls,
    recording_rate: percentage(recordedCalls, totalCalls),
    queue_entries: queueEntries.length,
    queue_answered: queueAnswered,
    queue_abandoned: queueAbandoned,
    queue_abandon_rate: percentage(queueAbandoned, queueEntries.length),
    routing_attempts: attempts.length,
    routing_failures: routingFailures,
    provider_metrics: providers,
    direction_metrics: directions,
    agent_metrics: agents,
    queue_metrics: queuesMetrics,
    routing_metrics: routing,
    trend_metrics: trend,
    captured_by: membership.user_id,
    metadata: { source: 'flowtix_call_analytics_v1' },
  }

  const { data, error } = await supabase
    .from('call_analytics_snapshots')
    .insert(snapshotInsert)
    .select('*')
    .single()
  if (error) throw new Error(`Unable to save call analytics: ${error.message}`)
  return mapStoredSnapshot(data as StoredSnapshotRow)
}

export async function getCallAnalyticsOverview(period: ReportRange): Promise<CallAnalyticsOverview> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const { data: latest, error } = await supabase
    .from('call_analytics_snapshots')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .eq('period', period)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Unable to load call analytics: ${error.message}`)

  const latestSnapshot = latest ? mapStoredSnapshot(latest as StoredSnapshotRow) : null
  const latestCapturedAt = latestSnapshot ? new Date(latestSnapshot.capturedAt).getTime() : Number.NaN
  const snapshotIsFresh = Number.isFinite(latestCapturedAt)
    && Date.now() - latestCapturedAt < 15 * 60 * 1000

  const snapshot = latestSnapshot && snapshotIsFresh
    ? latestSnapshot
    : await collectCallAnalyticsSnapshot(period)

  const { data: history, error: historyError } = await supabase
    .from('call_analytics_snapshots')
    .select('id,period,period_start,period_end,captured_at')
    .eq('organization_id', membership.organization_id)
    .eq('period', period)
    .order('captured_at', { ascending: false })
    .limit(30)
  if (historyError) throw new Error(`Unable to load call analytics history: ${historyError.message}`)

  return {
    snapshot,
    history: (history ?? []).map((row) => ({
      id: asString(row.id),
      period: row.period as ReportRange,
      periodStart: asString(row.period_start),
      periodEnd: asString(row.period_end),
      capturedAt: asString(row.captured_at),
    })),
  }
}
