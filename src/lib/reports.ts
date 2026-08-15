import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

type DbRow = Record<string, unknown>

export type ReportRange = '7d' | '30d' | '90d' | '365d'

export type DailyMetric = {
  date: string
  label: string
  calls: number
  activities: number
  revenue: number
}

export type AgentPerformance = {
  userId: string
  name: string
  email: string
  role: string
  calls: number
  connectedCalls: number
  talkSeconds: number
  activities: number
  opportunities: number
  wonDeals: number
  revenue: number
  conversionRate: number
}

export type ActivityBreakdown = {
  calls: number
  notes: number
  tasks: number
  completedTasks: number
  emails: number
  sms: number
  comments: number
}

export type ReportsData = {
  range: ReportRange
  rangeStart: string
  rangeEnd: string
  totalRevenue: number
  pipelineValue: number
  weightedPipelineValue: number
  wonDeals: number
  lostDeals: number
  openDeals: number
  conversionRate: number
  totalCalls: number
  connectedCalls: number
  missedCalls: number
  averageCallSeconds: number
  totalTalkSeconds: number
  activity: ActivityBreakdown
  daily: DailyMetric[]
  agents: AgentPerformance[]
}

const connectedStatuses = new Set(['answered', 'completed', 'connected', 'in-progress', 'in_progress', 'bridged'])
const failedStatuses = new Set(['failed', 'busy', 'no-answer', 'no_answer', 'canceled', 'cancelled', 'missed'])
const missedStatuses = new Set(['busy', 'no-answer', 'no_answer', 'missed'])

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function dateKey(value: unknown): string | null {
  const raw = asString(value)
  const date = new Date(raw)
  if (!raw || Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function dateSeconds(startValue: unknown, endValue: unknown): number {
  const startRaw = asString(startValue)
  const endRaw = asString(endValue)
  if (!startRaw || !endRaw) return 0
  const start = new Date(startRaw).getTime()
  const end = new Date(endRaw).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) / 1000)
}

function getRangeDays(range: ReportRange): number {
  if (range === '7d') return 7
  if (range === '90d') return 90
  if (range === '365d') return 365
  return 30
}

export function normalizeReportRange(value: string | undefined): ReportRange {
  return value === '7d' || value === '30d' || value === '90d' || value === '365d'
    ? value
    : '30d'
}

function buildDailySeries(range: ReportRange, end: Date): DailyMetric[] {
  const days = getRangeDays(range)
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  })

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (days - index - 1))
    const key = date.toISOString().slice(0, 10)
    return {
      date: key,
      label: formatter.format(date),
      calls: 0,
      activities: 0,
      revenue: 0,
    }
  })
}

function incrementDaily(
  dailyMap: Map<string, DailyMetric>,
  row: DbRow,
  field: string,
  updater: (metric: DailyMetric) => void,
): void {
  const key = dateKey(row[field])
  if (!key) return
  const metric = dailyMap.get(key)
  if (metric) updater(metric)
}

export async function getReportsData(range: ReportRange): Promise<ReportsData> {
  const membership = await requireOrganization()
  const supabase = await createClient()
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - getRangeDays(range) + 1)
  start.setUTCHours(0, 0, 0, 0)

  const organizationId = membership.organization_id
  const startIso = start.toISOString()

  const [
    callsResult,
    opportunitiesResult,
    notesResult,
    tasksResult,
    communicationsResult,
    commentsResult,
    membersResult,
    profilesResult,
  ] = await Promise.all([
    supabase
      .from('calls')
      .select('id,status,duration_seconds,created_by,started_at,ended_at,created_at,provider_status_raw,routing_status')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso),
    supabase
      .from('opportunities')
      .select('id,status,value,probability,owner_id,created_by,created_at,updated_at')
      .eq('organization_id', organizationId),
    supabase
      .from('notes')
      .select('id,created_by,created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso),
    supabase
      .from('contact_tasks')
      .select('id,status,created_by,assigned_to,created_at,completed_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso),
    supabase
      .from('communication_messages')
      .select('id,channel,status,sent_by,created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso),
    supabase
      .from('internal_comments')
      .select('id,created_by,created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso),
    supabase
      .from('organization_members')
      .select('user_id,role,status')
      .eq('organization_id', organizationId),
    supabase.from('profiles').select('id,full_name,email'),
  ])

  const results = [
    callsResult,
    opportunitiesResult,
    notesResult,
    tasksResult,
    communicationsResult,
    commentsResult,
    membersResult,
    profilesResult,
  ]
  const firstError = results.find((result) => result.error)?.error
  if (firstError) {
    throw new Error(`Failed to load reports: ${firstError.message}`)
  }

  const calls = (callsResult.data ?? []) as DbRow[]
  const opportunities = (opportunitiesResult.data ?? []) as DbRow[]
  const notes = (notesResult.data ?? []) as DbRow[]
  const tasks = (tasksResult.data ?? []) as DbRow[]
  const communications = (communicationsResult.data ?? []) as DbRow[]
  const comments = (commentsResult.data ?? []) as DbRow[]
  const members = (membersResult.data ?? []) as DbRow[]
  const profiles = (profilesResult.data ?? []) as DbRow[]

  const profilesById = new Map(
    profiles.map((profile) => [asString(profile.id), profile]),
  )

  const daily = buildDailySeries(range, end)
  const dailyMap = new Map(daily.map((metric) => [metric.date, metric]))

  let connectedCalls = 0
  let missedCalls = 0
  let totalTalkSeconds = 0

  const agentMap = new Map<string, AgentPerformance>()
  for (const member of members) {
    const userId = asString(member.user_id)
    if (!userId) continue
    const profile = profilesById.get(userId)
    const email = asString(profile?.email)
    agentMap.set(userId, {
      userId,
      name: asString(profile?.full_name) || email.split('@')[0] || 'Team member',
      email,
      role: asString(member.role) || 'agent',
      calls: 0,
      connectedCalls: 0,
      talkSeconds: 0,
      activities: 0,
      opportunities: 0,
      wonDeals: 0,
      revenue: 0,
      conversionRate: 0,
    })
  }

  for (const call of calls) {
    const status = (
      asString(call.provider_status_raw) ||
      asString(call.routing_status) ||
      asString(call.status)
    ).toLowerCase()
    const duration = Math.max(
      0,
      asNumber(call.duration_seconds) || dateSeconds(call.started_at, call.ended_at),
    )
    const userId = asString(call.created_by)
    const agent = agentMap.get(userId)
    const connected =
      connectedStatuses.has(status) ||
      (duration > 0 && !failedStatuses.has(status))

    if (connected) connectedCalls += 1
    if (missedStatuses.has(status)) missedCalls += 1
    if (connected) totalTalkSeconds += duration

    if (agent) {
      agent.calls += 1
      agent.activities += 1
      if (connected) {
        agent.talkSeconds += duration
        agent.connectedCalls += 1
      }
    }

    incrementDaily(dailyMap, call, 'started_at', (metric) => {
      metric.calls += 1
      metric.activities += 1
    })
  }

  let totalRevenue = 0
  let pipelineValue = 0
  let weightedPipelineValue = 0
  let wonDeals = 0
  let lostDeals = 0
  let openDeals = 0

  for (const opportunity of opportunities) {
    const status = asString(opportunity.status).toLowerCase()
    const value = asNumber(opportunity.value)
    const probability = asNumber(opportunity.probability)
    const userId = asString(opportunity.owner_id) || asString(opportunity.created_by)
    const agent = agentMap.get(userId)

    if (status === 'won') {
      wonDeals += 1
      totalRevenue += value
      if (agent) {
        agent.wonDeals += 1
        agent.revenue += value
      }
      incrementDaily(dailyMap, opportunity, 'updated_at', (metric) => {
        metric.revenue += value
      })
    } else if (status === 'lost') {
      lostDeals += 1
    } else {
      openDeals += 1
      pipelineValue += value
      weightedPipelineValue += value * (probability / 100)
    }

    if (agent) agent.opportunities += 1
  }

  function countActivity(rows: DbRow[], ownerFields: string[]): void {
    for (const row of rows) {
      const userId = ownerFields.map((field) => asString(row[field])).find(Boolean) ?? ''
      const agent = agentMap.get(userId)
      if (agent) agent.activities += 1
      incrementDaily(dailyMap, row, 'created_at', (metric) => {
        metric.activities += 1
      })
    }
  }

  countActivity(notes, ['created_by'])
  countActivity(tasks, ['assigned_to', 'created_by'])
  countActivity(communications, ['sent_by'])
  countActivity(comments, ['created_by'])

  const wonAndLost = wonDeals + lostDeals
  const conversionRate = wonAndLost > 0 ? (wonDeals / wonAndLost) * 100 : 0

  const agents = [...agentMap.values()]
    .map((agent) => ({
      ...agent,
      conversionRate:
        agent.opportunities > 0 ? (agent.wonDeals / agent.opportunities) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.activities - a.activities)

  return {
    range,
    rangeStart: startIso,
    rangeEnd: end.toISOString(),
    totalRevenue,
    pipelineValue,
    weightedPipelineValue,
    wonDeals,
    lostDeals,
    openDeals,
    conversionRate,
    totalCalls: calls.length,
    connectedCalls,
    missedCalls,
    averageCallSeconds: connectedCalls > 0 ? Math.round(totalTalkSeconds / connectedCalls) : 0,
    totalTalkSeconds,
    activity: {
      calls: calls.length,
      notes: notes.length,
      tasks: tasks.length,
      completedTasks: tasks.filter((task) => asString(task.status) === 'completed').length,
      emails: communications.filter((item) => asString(item.channel) === 'email').length,
      sms: communications.filter((item) => asString(item.channel) === 'sms').length,
      comments: comments.length,
    },
    daily,
    agents,
  }
}
