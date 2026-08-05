import { requirePermission } from '@/lib/auth'
import { normalizeReportRange, type ReportRange } from '@/lib/reports'
import { createClient } from '@/lib/supabase/server'
import type { AgentAnalyticsOverview, AgentAnalyticsSnapshot, AgentPerformanceMetric, AgentTrendPoint } from './types'

type Row = Record<string, unknown>

type StoredSnapshotRow = {
  id: string
  period: ReportRange
  period_start: string
  period_end: string
  captured_at: string
  total_agents: number | string
  available_agents: number | string
  busy_agents: number | string
  away_agents: number | string
  offline_agents: number | string
  total_calls: number | string
  connected_calls: number | string
  connect_rate: number | string
  total_talk_seconds: number | string
  completed_tasks: number | string
  overdue_tasks: number | string
  completed_activities: number | string
  attendance_seconds: number | string
  average_coaching_score: number | string | null
  average_productivity_score: number | string
  agent_metrics: unknown
  trend_metrics: unknown
  metadata: unknown
}

const connectedStatuses = new Set(['answered', 'completed', 'connected', 'in-progress', 'in_progress', 'bridged'])
const failedStatuses = new Set(['failed', 'busy', 'no-answer', 'no_answer', 'canceled', 'cancelled', 'missed'])

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function periodDays(period: ReportRange): number {
  if (period === '7d') return 7
  if (period === '90d') return 90
  if (period === '365d') return 365
  return 30
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function durationSeconds(start: unknown, end: unknown, periodEnd: Date): number {
  const startDate = new Date(text(start))
  const endDate = end ? new Date(text(end)) : periodEnd
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 1000)
}

function buildTrend(period: ReportRange, end: Date): AgentTrendPoint[] {
  const days = periodDays(period)
  const formatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (days - index - 1))
    const key = date.toISOString().slice(0, 10)
    return { date: key, label: formatter.format(date), calls: 0, connectedCalls: 0, talkSeconds: 0, completedTasks: 0, completedActivities: 0 }
  })
}

function mapStored(row: StoredSnapshotRow): AgentAnalyticsSnapshot {
  return {
    id: row.id,
    period: row.period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    capturedAt: row.captured_at,
    totalAgents: number(row.total_agents),
    availableAgents: number(row.available_agents),
    busyAgents: number(row.busy_agents),
    awayAgents: number(row.away_agents),
    offlineAgents: number(row.offline_agents),
    totalCalls: number(row.total_calls),
    connectedCalls: number(row.connected_calls),
    connectRate: number(row.connect_rate),
    totalTalkSeconds: number(row.total_talk_seconds),
    completedTasks: number(row.completed_tasks),
    overdueTasks: number(row.overdue_tasks),
    completedActivities: number(row.completed_activities),
    attendanceSeconds: number(row.attendance_seconds),
    averageCoachingScore: row.average_coaching_score == null ? null : number(row.average_coaching_score),
    averageProductivityScore: number(row.average_productivity_score),
    agents: array<AgentPerformanceMetric>(row.agent_metrics),
    trend: array<AgentTrendPoint>(row.trend_metrics),
    metadata: object(row.metadata),
  }
}

export function normalizeAgentAnalyticsPeriod(value: string | undefined): ReportRange {
  return normalizeReportRange(value)
}

export async function collectAgentAnalyticsSnapshot(period: ReportRange): Promise<AgentAnalyticsSnapshot> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const organizationId = membership.organization_id
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - periodDays(period) + 1)
  start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString()
  const endIso = now.toISOString()

  const [membersResult, profilesResult, presenceResult, callsResult, tasksResult, activitiesResult, attendanceResult, coachingResult] = await Promise.all([
    supabase.from('organization_members').select('id,user_id,role,status').eq('organization_id', organizationId).eq('status', 'active'),
    supabase.from('profiles').select('id,full_name,email'),
    supabase.from('agent_presence').select('user_id,availability,activity_state').eq('organization_id', organizationId),
    supabase.from('calls').select('id,status,provider_status_raw,routing_status,started_at,ended_at,duration_seconds,owner_user_id,owner_membership_id,created_by').eq('organization_id', organizationId).gte('started_at', startIso).lte('started_at', endIso),
    supabase.from('contact_tasks').select('id,status,due_at,completed_at,assigned_to,owner_membership_id,created_by').eq('organization_id', organizationId).or(`created_at.gte.${startIso},completed_at.gte.${startIso}`),
    supabase.from('crm_activities').select('id,status,occurred_at,owner_membership_id,created_by').eq('organization_id', organizationId).gte('occurred_at', startIso).lte('occurred_at', endIso),
    supabase.from('attendance_entries').select('user_id,clocked_in_at,clocked_out_at').eq('organization_id', organizationId).gte('clocked_in_at', startIso).lte('clocked_in_at', endIso),
    supabase.from('ai_coaching_analyses').select('agent_user_id,overall_score,created_at').eq('organization_id', organizationId).gte('created_at', startIso).lte('created_at', endIso),
  ])

  const requiredResults = [membersResult, profilesResult, presenceResult, callsResult, tasksResult, activitiesResult, coachingResult]
  const firstError = requiredResults.find((result) => result.error)?.error
  if (firstError) throw new Error(`Unable to collect agent analytics: ${firstError.message}`)

  const attendanceAccessible = !attendanceResult.error
  const members = (membersResult.data ?? []) as Row[]
  const profiles = (profilesResult.data ?? []) as Row[]
  const presence = (presenceResult.data ?? []) as Row[]
  const calls = (callsResult.data ?? []) as Row[]
  const tasks = (tasksResult.data ?? []) as Row[]
  const activities = (activitiesResult.data ?? []) as Row[]
  const attendance = attendanceAccessible ? ((attendanceResult.data ?? []) as Row[]) : []
  const coaching = (coachingResult.data ?? []) as Row[]

  const profileByUser = new Map(profiles.map((row) => [text(row.id), row]))
  const membershipById = new Map(members.map((row) => [text(row.id), row]))
  const presenceByUser = new Map(presence.map((row) => [text(row.user_id), row]))
  const trend = buildTrend(period, now)
  const trendByDate = new Map(trend.map((point) => [point.date, point]))

  type Mutable = AgentPerformanceMetric & { talkCallCount: number; coachingTotal: number }
  const metrics = new Map<string, Mutable>()
  for (const member of members) {
    const userId = text(member.user_id)
    const profile = profileByUser.get(userId)
    const state = presenceByUser.get(userId)
    metrics.set(userId, {
      membershipId: text(member.id), userId,
      name: text(profile?.full_name) || text(profile?.email) || 'Unnamed agent',
      role: text(member.role) || 'member',
      availability: (text(state?.availability) || 'offline') as Mutable['availability'],
      activityState: (text(state?.activity_state) || 'idle') as Mutable['activityState'],
      totalCalls: 0, connectedCalls: 0, failedCalls: 0, connectRate: 0, talkSeconds: 0, averageCallSeconds: 0,
      assignedTasks: 0, completedTasks: 0, overdueTasks: 0, taskCompletionRate: 0,
      completedActivities: 0, attendanceSeconds: 0, utilizationRate: 0,
      coachingCount: 0, coachingScore: null, productivityScore: 0,
      talkCallCount: 0, coachingTotal: 0,
    })
  }

  for (const call of calls) {
    const membershipOwner = membershipById.get(text(call.owner_membership_id))
    const userId = text(call.owner_user_id) || text(membershipOwner?.user_id) || text(call.created_by)
    const metric = metrics.get(userId)
    if (!metric) continue
    const status = (text(call.provider_status_raw) || text(call.routing_status) || text(call.status)).toLowerCase()
    const connected = connectedStatuses.has(status)
    metric.totalCalls += 1
    if (connected) metric.connectedCalls += 1
    if (failedStatuses.has(status)) metric.failedCalls += 1
    const seconds = number(call.duration_seconds) || durationSeconds(call.started_at, call.ended_at, now)
    if (connected && seconds > 0) { metric.talkSeconds += seconds; metric.talkCallCount += 1 }
    const point = trendByDate.get(text(call.started_at).slice(0, 10))
    if (point) { point.calls += 1; if (connected) point.connectedCalls += 1; if (connected) point.talkSeconds += seconds }
  }

  for (const task of tasks) {
    const ownerMember = membershipById.get(text(task.owner_membership_id))
    const userId = text(task.assigned_to) || text(ownerMember?.user_id) || text(task.created_by)
    const metric = metrics.get(userId)
    if (!metric) continue
    metric.assignedTasks += 1
    const completed = text(task.status) === 'completed'
    if (completed) metric.completedTasks += 1
    const dueAt = new Date(text(task.due_at))
    if (!completed && !Number.isNaN(dueAt.getTime()) && dueAt < now) metric.overdueTasks += 1
    if (completed) {
      const point = trendByDate.get(text(task.completed_at).slice(0, 10))
      if (point) point.completedTasks += 1
    }
  }

  for (const activity of activities) {
    if (text(activity.status) !== 'completed') continue
    const ownerMember = membershipById.get(text(activity.owner_membership_id))
    const userId = text(ownerMember?.user_id) || text(activity.created_by)
    const metric = metrics.get(userId)
    if (!metric) continue
    metric.completedActivities += 1
    const point = trendByDate.get(text(activity.occurred_at).slice(0, 10))
    if (point) point.completedActivities += 1
  }

  for (const entry of attendance) {
    const metric = metrics.get(text(entry.user_id))
    if (!metric) continue
    metric.attendanceSeconds += durationSeconds(entry.clocked_in_at, entry.clocked_out_at, now)
  }

  for (const analysis of coaching) {
    const metric = metrics.get(text(analysis.agent_user_id))
    if (!metric) continue
    metric.coachingCount += 1
    metric.coachingTotal += number(analysis.overall_score)
  }

  const agents = Array.from(metrics.values()).map((metric) => {
    metric.connectRate = percentage(metric.connectedCalls, metric.totalCalls)
    metric.averageCallSeconds = metric.talkCallCount > 0 ? metric.talkSeconds / metric.talkCallCount : 0
    metric.taskCompletionRate = percentage(metric.completedTasks, metric.assignedTasks)
    metric.utilizationRate = percentage(metric.talkSeconds, metric.attendanceSeconds)
    metric.coachingScore = metric.coachingCount > 0 ? metric.coachingTotal / metric.coachingCount : null
    const activityScore = clamp(metric.completedActivities * 5)
    metric.productivityScore = clamp(metric.connectRate * 0.35 + metric.taskCompletionRate * 0.3 + activityScore * 0.15 + (metric.coachingScore ?? 0) * 0.2)
    return {
      membershipId: metric.membershipId,
      userId: metric.userId,
      name: metric.name,
      role: metric.role,
      availability: metric.availability,
      activityState: metric.activityState,
      totalCalls: metric.totalCalls,
      connectedCalls: metric.connectedCalls,
      failedCalls: metric.failedCalls,
      connectRate: metric.connectRate,
      talkSeconds: metric.talkSeconds,
      averageCallSeconds: metric.averageCallSeconds,
      assignedTasks: metric.assignedTasks,
      completedTasks: metric.completedTasks,
      overdueTasks: metric.overdueTasks,
      taskCompletionRate: metric.taskCompletionRate,
      completedActivities: metric.completedActivities,
      attendanceSeconds: metric.attendanceSeconds,
      utilizationRate: metric.utilizationRate,
      coachingCount: metric.coachingCount,
      coachingScore: metric.coachingScore,
      productivityScore: metric.productivityScore,
    }
  }).sort((a, b) => b.productivityScore - a.productivityScore || a.name.localeCompare(b.name))

  const totalAgents = agents.length
  const availableAgents = agents.filter((agent) => agent.availability === 'available' && agent.activityState === 'idle').length
  const busyAgents = agents.filter((agent) => ['busy', 'ringing', 'wrap_up'].includes(agent.activityState)).length
  const awayAgents = agents.filter((agent) => agent.availability === 'away' || agent.availability === 'dnd').length
  const offlineAgents = agents.filter((agent) => agent.availability === 'offline').length
  const totalCalls = agents.reduce((sum, agent) => sum + agent.totalCalls, 0)
  const connectedCalls = agents.reduce((sum, agent) => sum + agent.connectedCalls, 0)
  const totalTalkSeconds = agents.reduce((sum, agent) => sum + agent.talkSeconds, 0)
  const completedTasks = agents.reduce((sum, agent) => sum + agent.completedTasks, 0)
  const overdueTasks = agents.reduce((sum, agent) => sum + agent.overdueTasks, 0)
  const completedActivities = agents.reduce((sum, agent) => sum + agent.completedActivities, 0)
  const attendanceSeconds = agents.reduce((sum, agent) => sum + agent.attendanceSeconds, 0)
  const coachingScores = agents.flatMap((agent) => agent.coachingScore == null ? [] : [agent.coachingScore])
  const averageCoachingScore = coachingScores.length > 0 ? coachingScores.reduce((sum, value) => sum + value, 0) / coachingScores.length : null
  const averageProductivityScore = totalAgents > 0 ? agents.reduce((sum, agent) => sum + agent.productivityScore, 0) / totalAgents : 0

  const payload = {
    organization_id: organizationId, period, period_start: startIso, period_end: endIso,
    total_agents: totalAgents, available_agents: availableAgents, busy_agents: busyAgents, away_agents: awayAgents, offline_agents: offlineAgents,
    total_calls: totalCalls, connected_calls: connectedCalls, connect_rate: percentage(connectedCalls, totalCalls), total_talk_seconds: Math.round(totalTalkSeconds),
    completed_tasks: completedTasks, overdue_tasks: overdueTasks, completed_activities: completedActivities, attendance_seconds: Math.round(attendanceSeconds),
    average_coaching_score: averageCoachingScore, average_productivity_score: averageProductivityScore,
    agent_metrics: agents, trend_metrics: trend, captured_by: membership.user_id,
    metadata: { attendanceAccessible, source: 'flowtix-agent-analytics-v1' },
  }
  const { data, error } = await supabase.from('agent_analytics_snapshots').insert(payload).select('*').single()
  if (error) throw new Error(`Unable to save agent analytics snapshot: ${error.message}`)
  return mapStored(data as StoredSnapshotRow)
}

export async function getAgentAnalyticsOverview(period: ReportRange): Promise<AgentAnalyticsOverview> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const { data, error } = await supabase.from('agent_analytics_snapshots').select('*').eq('organization_id', membership.organization_id).eq('period', period).order('captured_at', { ascending: false }).limit(25)
  if (error) throw new Error(`Unable to load agent analytics: ${error.message}`)
  const rows = (data ?? []) as StoredSnapshotRow[]
  const snapshot = rows[0] ? mapStored(rows[0]) : await collectAgentAnalyticsSnapshot(period)
  return {
    snapshot,
    history: rows.map((row) => ({ id: row.id, period: row.period, periodStart: row.period_start, periodEnd: row.period_end, capturedAt: row.captured_at })),
  }
}
