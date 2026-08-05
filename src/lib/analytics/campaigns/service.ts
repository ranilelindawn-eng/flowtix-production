import { requirePermission } from '@/lib/auth'
import { normalizeReportRange, type ReportRange } from '@/lib/reports'
import { createClient } from '@/lib/supabase/server'
import type { CampaignAnalyticsOverview, CampaignAnalyticsSnapshot, CampaignFunnelStage, CampaignMetric, CampaignTrendPoint } from './types'

type Row = Record<string, unknown>
type StoredRow = {
  id: string; period: ReportRange; period_start: string; period_end: string; captured_at: string
  total_campaigns: number | string; active_campaigns: number | string; enrollments: number | string; completed_enrollments: number | string
  delivery_attempts: number | string; delivered: number | string; failed: number | string; email_sent: number | string; email_opened: number | string
  email_clicked: number | string; email_replied: number | string; email_bounced: number | string; sms_sent: number | string; sms_delivered: number | string
  sms_replied: number | string; calls: number | string; connected_calls: number | string; conversions: number | string; revenue: number | string
  cost: number | string; delivery_rate: number | string; open_rate: number | string; click_rate: number | string; reply_rate: number | string
  bounce_rate: number | string; sms_delivery_rate: number | string; sms_reply_rate: number | string; call_connect_rate: number | string
  conversion_rate: number | string; roi: number | string; campaign_metrics: unknown; funnel_metrics: unknown; trend_metrics: unknown; metadata: unknown
}

const connectedCallStatuses = new Set(['answered', 'completed', 'connected', 'in-progress', 'in_progress', 'bridged'])
const numberValue = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const rows = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const rate = (part: number, total: number): number => total > 0 ? (part / total) * 100 : 0
const daysFor = (period: ReportRange): number => period === '7d' ? 7 : period === '90d' ? 90 : period === '365d' ? 365 : 30
const roi = (revenue: number, cost: number): number => cost > 0 ? ((revenue - cost) / cost) * 100 : revenue > 0 ? 100 : 0

function mapStored(row: StoredRow): CampaignAnalyticsSnapshot {
  return {
    id: row.id, period: row.period, periodStart: row.period_start, periodEnd: row.period_end, capturedAt: row.captured_at,
    totalCampaigns: numberValue(row.total_campaigns), activeCampaigns: numberValue(row.active_campaigns), enrollments: numberValue(row.enrollments), completedEnrollments: numberValue(row.completed_enrollments),
    deliveryAttempts: numberValue(row.delivery_attempts), delivered: numberValue(row.delivered), failed: numberValue(row.failed), emailSent: numberValue(row.email_sent), emailOpened: numberValue(row.email_opened),
    emailClicked: numberValue(row.email_clicked), emailReplied: numberValue(row.email_replied), emailBounced: numberValue(row.email_bounced), smsSent: numberValue(row.sms_sent), smsDelivered: numberValue(row.sms_delivered),
    smsReplied: numberValue(row.sms_replied), calls: numberValue(row.calls), connectedCalls: numberValue(row.connected_calls), conversions: numberValue(row.conversions), revenue: numberValue(row.revenue), cost: numberValue(row.cost),
    deliveryRate: numberValue(row.delivery_rate), openRate: numberValue(row.open_rate), clickRate: numberValue(row.click_rate), replyRate: numberValue(row.reply_rate), bounceRate: numberValue(row.bounce_rate),
    smsDeliveryRate: numberValue(row.sms_delivery_rate), smsReplyRate: numberValue(row.sms_reply_rate), callConnectRate: numberValue(row.call_connect_rate), conversionRate: numberValue(row.conversion_rate), roi: numberValue(row.roi),
    campaigns: rows<CampaignMetric>(row.campaign_metrics), funnel: rows<CampaignFunnelStage>(row.funnel_metrics), trend: rows<CampaignTrendPoint>(row.trend_metrics), metadata: object(row.metadata),
  }
}

function buildTrend(period: ReportRange, end: Date): CampaignTrendPoint[] {
  const length = daysFor(period)
  const formatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
  return Array.from({ length }, (_, index) => {
    const date = new Date(end); date.setUTCDate(end.getUTCDate() - (length - index - 1)); const key = date.toISOString().slice(0, 10)
    return { date: key, label: formatter.format(date), enrollments: 0, delivered: 0, opens: 0, clicks: 0, replies: 0, calls: 0, conversions: 0, revenue: 0 }
  })
}

export function normalizeCampaignAnalyticsPeriod(value: string | undefined): ReportRange { return normalizeReportRange(value) }

export async function collectCampaignAnalyticsSnapshot(period: ReportRange): Promise<CampaignAnalyticsSnapshot> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const organizationId = membership.organization_id
  const now = new Date(); const start = new Date(now); start.setUTCDate(now.getUTCDate() - daysFor(period) + 1); start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString(); const endIso = now.toISOString()

  const [campaignsResult, membersResult, messagesResult, engagementResult, callsResult, sequencesResult, enrollmentsResult, executionsResult] = await Promise.all([
    supabase.from('campaigns').select('id,name,status').eq('organization_id', organizationId),
    supabase.from('campaign_members').select('campaign_id,status,created_at,completed_at').eq('organization_id', organizationId).gte('created_at', startIso).lte('created_at', endIso),
    supabase.from('communication_messages').select('id,campaign_id,channel,direction,status,created_at,sent_at,delivered_at').eq('organization_id', organizationId).gte('created_at', startIso).lte('created_at', endIso),
    supabase.from('campaign_engagement_events').select('campaign_id,event_type,event_at,value,cost').eq('organization_id', organizationId).gte('event_at', startIso).lte('event_at', endIso),
    supabase.from('calls').select('campaign_id,status,started_at').eq('organization_id', organizationId).gte('started_at', startIso).lte('started_at', endIso),
    supabase.from('sequences').select('id,name,status').eq('organization_id', organizationId),
    supabase.from('sequence_enrollments').select('sequence_id,status,created_at,completed_at').eq('organization_id', organizationId).gte('created_at', startIso).lte('created_at', endIso),
    supabase.from('sequence_step_executions').select('sequence_id,channel,status,created_at,completed_at').eq('organization_id', organizationId).gte('created_at', startIso).lte('created_at', endIso),
  ])
  const required = [campaignsResult, membersResult, messagesResult, callsResult, sequencesResult, enrollmentsResult, executionsResult]
  const error = required.find((result) => result.error)?.error
  if (error) throw new Error(`Unable to collect campaign analytics: ${error.message}`)
  if (engagementResult.error) throw new Error(`Unable to collect campaign engagement analytics: ${engagementResult.error.message}`)

  const campaigns = (campaignsResult.data ?? []) as Row[]; const members = (membersResult.data ?? []) as Row[]; const messages = (messagesResult.data ?? []) as Row[]
  const engagements = (engagementResult.data ?? []) as Row[]; const calls = (callsResult.data ?? []) as Row[]; const sequences = (sequencesResult.data ?? []) as Row[]
  const enrollments = (enrollmentsResult.data ?? []) as Row[]; const executions = (executionsResult.data ?? []) as Row[]
  const trend = buildTrend(period, now); const trendByDate = new Map(trend.map((point) => [point.date, point]))

  type MutableMetric = CampaignMetric
  const metrics = new Map<string, MutableMetric>()
  for (const campaign of campaigns) {
    const campaignId = text(campaign.id)
    metrics.set(campaignId, { campaignId, name: text(campaign.name) || 'Unnamed campaign', status: text(campaign.status) || 'draft', enrollments: 0, completedEnrollments: 0, deliveryAttempts: 0, delivered: 0, failed: 0, emailSent: 0, emailDelivered: 0, emailOpened: 0, emailClicked: 0, emailReplied: 0, emailBounced: 0, smsSent: 0, smsDelivered: 0, smsReplied: 0, calls: 0, connectedCalls: 0, conversions: 0, revenue: 0, cost: 0, deliveryRate: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0, smsDeliveryRate: 0, smsReplyRate: 0, callConnectRate: 0, conversionRate: 0, roi: 0 })
  }
  const ensure = (campaignId: string): MutableMetric | undefined => metrics.get(campaignId)
  for (const member of members) { const metric = ensure(text(member.campaign_id)); if (!metric) continue; metric.enrollments += 1; if (text(member.status) === 'completed') metric.completedEnrollments += 1; const point = trendByDate.get(text(member.created_at).slice(0, 10)); if (point) point.enrollments += 1 }
  for (const message of messages) {
    const metric = ensure(text(message.campaign_id)); if (!metric) continue; const channel = text(message.channel); const direction = text(message.direction); const status = text(message.status)
    if (direction === 'outbound') { metric.deliveryAttempts += 1; if (status === 'delivered') metric.delivered += 1; if (status === 'failed') metric.failed += 1; if (channel === 'email') { metric.emailSent += 1; if (status === 'delivered') metric.emailDelivered += 1 } if (channel === 'sms') { metric.smsSent += 1; if (status === 'delivered') metric.smsDelivered += 1 } }
    if (direction === 'inbound' && channel === 'email') metric.emailReplied += 1
    if (direction === 'inbound' && channel === 'sms') metric.smsReplied += 1
    const point = trendByDate.get(text(message.created_at).slice(0, 10)); if (point && status === 'delivered') point.delivered += 1
  }
  for (const event of engagements) {
    const metric = ensure(text(event.campaign_id)); if (!metric) continue; const eventType = text(event.event_type); const point = trendByDate.get(text(event.event_at).slice(0, 10))
    if (eventType === 'email_open') { metric.emailOpened += 1; if (point) point.opens += 1 }
    if (eventType === 'email_click') { metric.emailClicked += 1; if (point) point.clicks += 1 }
    if (eventType === 'email_reply') { metric.emailReplied += 1; if (point) point.replies += 1 }
    if (eventType === 'email_bounce') metric.emailBounced += 1
    if (eventType === 'sms_reply') { metric.smsReplied += 1; if (point) point.replies += 1 }
    if (eventType === 'conversion') { metric.conversions += 1; metric.revenue += numberValue(event.value); if (point) { point.conversions += 1; point.revenue += numberValue(event.value) } }
    metric.cost += numberValue(event.cost)
  }
  for (const call of calls) { const metric = ensure(text(call.campaign_id)); if (!metric) continue; metric.calls += 1; if (connectedCallStatuses.has(text(call.status))) metric.connectedCalls += 1; const point = trendByDate.get(text(call.started_at).slice(0, 10)); if (point) point.calls += 1 }

  const campaignMetrics = [...metrics.values()].map((metric) => ({ ...metric, deliveryRate: rate(metric.delivered, metric.deliveryAttempts), openRate: rate(metric.emailOpened, metric.emailDelivered || metric.emailSent), clickRate: rate(metric.emailClicked, metric.emailDelivered || metric.emailSent), replyRate: rate(metric.emailReplied, metric.emailDelivered || metric.emailSent), bounceRate: rate(metric.emailBounced, metric.emailSent), smsDeliveryRate: rate(metric.smsDelivered, metric.smsSent), smsReplyRate: rate(metric.smsReplied, metric.smsDelivered || metric.smsSent), callConnectRate: rate(metric.connectedCalls, metric.calls), conversionRate: rate(metric.conversions, metric.enrollments), roi: roi(metric.revenue, metric.cost) })).sort((a, b) => b.conversions - a.conversions || b.revenue - a.revenue || a.name.localeCompare(b.name))

  const totals = campaignMetrics.reduce((acc, metric) => { for (const key of ['enrollments','completedEnrollments','deliveryAttempts','delivered','failed','emailSent','emailOpened','emailClicked','emailReplied','emailBounced','smsSent','smsDelivered','smsReplied','calls','connectedCalls','conversions','revenue','cost'] as const) acc[key] += metric[key]; return acc }, { enrollments: 0, completedEnrollments: 0, deliveryAttempts: 0, delivered: 0, failed: 0, emailSent: 0, emailOpened: 0, emailClicked: 0, emailReplied: 0, emailBounced: 0, smsSent: 0, smsDelivered: 0, smsReplied: 0, calls: 0, connectedCalls: 0, conversions: 0, revenue: 0, cost: 0 })
  const reached = Math.max(totals.delivered, totals.connectedCalls)
  const engaged = totals.emailOpened + totals.emailClicked + totals.emailReplied + totals.smsReplied + totals.connectedCalls
  const funnel: CampaignFunnelStage[] = [
    { key: 'enrolled', label: 'Enrolled', value: totals.enrollments, rate: 100 },
    { key: 'reached', label: 'Reached', value: reached, rate: rate(reached, totals.enrollments) },
    { key: 'engaged', label: 'Engaged', value: engaged, rate: rate(engaged, totals.enrollments) },
    { key: 'converted', label: 'Converted', value: totals.conversions, rate: rate(totals.conversions, totals.enrollments) },
  ]
  const payload = {
    organization_id: organizationId, period, period_start: startIso, period_end: endIso, total_campaigns: campaignMetrics.length, active_campaigns: campaignMetrics.filter((item) => item.status === 'active').length,
    enrollments: totals.enrollments, completed_enrollments: totals.completedEnrollments, delivery_attempts: totals.deliveryAttempts, delivered: totals.delivered, failed: totals.failed,
    email_sent: totals.emailSent, email_opened: totals.emailOpened, email_clicked: totals.emailClicked, email_replied: totals.emailReplied,
    email_bounced: totals.emailBounced, sms_sent: totals.smsSent, sms_delivered: totals.smsDelivered, sms_replied: totals.smsReplied, calls: totals.calls, connected_calls: totals.connectedCalls, conversions: totals.conversions, revenue: totals.revenue, cost: totals.cost,
    delivery_rate: rate(totals.delivered, totals.deliveryAttempts), open_rate: rate(totals.emailOpened, totals.emailSent), click_rate: rate(totals.emailClicked, totals.emailSent), reply_rate: rate(totals.emailReplied, totals.emailSent), bounce_rate: rate(totals.emailBounced, totals.emailSent),
    sms_delivery_rate: rate(totals.smsDelivered, totals.smsSent), sms_reply_rate: rate(totals.smsReplied, totals.smsSent), call_connect_rate: rate(totals.connectedCalls, totals.calls), conversion_rate: rate(totals.conversions, totals.enrollments), roi: roi(totals.revenue, totals.cost),
    campaign_metrics: campaignMetrics, funnel_metrics: funnel, trend_metrics: trend, captured_by: membership.user_id,
    metadata: { source: 'flowtix-campaign-analytics-v1', sequenceCount: sequences.length, sequenceEnrollments: enrollments.length, sequenceExecutions: executions.length },
  }
  const { data, error: insertError } = await supabase.from('campaign_analytics_snapshots').insert(payload).select('*').single()
  if (insertError) throw new Error(`Unable to save campaign analytics snapshot: ${insertError.message}`)
  return mapStored(data as StoredRow)
}

export async function getCampaignAnalyticsOverview(period: ReportRange): Promise<CampaignAnalyticsOverview> {
  const membership = await requirePermission('reports.view'); const supabase = await createClient()
  const { data, error } = await supabase.from('campaign_analytics_snapshots').select('*').eq('organization_id', membership.organization_id).eq('period', period).order('captured_at', { ascending: false }).limit(25)
  if (error) throw new Error(`Unable to load campaign analytics: ${error.message}`)
  const stored = (data ?? []) as StoredRow[]; const snapshot = stored[0] ? mapStored(stored[0]) : await collectCampaignAnalyticsSnapshot(period)
  return { snapshot, history: stored.map((row) => ({ id: row.id, period: row.period, periodStart: row.period_start, periodEnd: row.period_end, capturedAt: row.captured_at })) }
}
