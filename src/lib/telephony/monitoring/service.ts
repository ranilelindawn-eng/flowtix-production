import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { TelephonyAlert, TelephonyMonitoringSnapshot, TelephonyQueueDiagnostic } from './types'

type SnapshotRow = {
  id: string
  captured_at: string
  active_calls: number
  ringing_calls: number
  connected_calls: number
  queued_calls: number
  waiting_queue_entries: number
  oldest_queue_wait_seconds: number
  available_agents: number
  busy_agents: number
  offline_agents: number
  routing_failures_last_hour: number
  provider_errors_last_hour: number
  calls_last_hour: number
  answered_calls_last_hour: number
  failed_calls_last_hour: number
  average_answer_seconds: number | string | null
  answer_rate: number | string
  provider_breakdown: Record<string, number> | null
  routing_breakdown: Record<string, number> | null
  queue_breakdown: TelephonyQueueDiagnostic[] | null
}

type AlertRow = {
  id: string
  rule_key: string
  severity: TelephonyAlert['severity']
  status: TelephonyAlert['status']
  title: string
  message: string
  metric: string
  metric_value: number | string | null
  threshold: number | string | null
  opened_at: string
  last_observed_at: string
  occurrence_count: number
}

function numberValue(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapSnapshot(row: SnapshotRow): TelephonyMonitoringSnapshot {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    activeCalls: row.active_calls,
    ringingCalls: row.ringing_calls,
    connectedCalls: row.connected_calls,
    queuedCalls: row.queued_calls,
    waitingQueueEntries: row.waiting_queue_entries,
    oldestQueueWaitSeconds: row.oldest_queue_wait_seconds,
    availableAgents: row.available_agents,
    busyAgents: row.busy_agents,
    offlineAgents: row.offline_agents,
    routingFailuresLastHour: row.routing_failures_last_hour,
    providerErrorsLastHour: row.provider_errors_last_hour,
    callsLastHour: row.calls_last_hour,
    answeredCallsLastHour: row.answered_calls_last_hour,
    failedCallsLastHour: row.failed_calls_last_hour,
    averageAnswerSeconds: numberValue(row.average_answer_seconds),
    answerRate: numberValue(row.answer_rate) ?? 0,
    providerBreakdown: row.provider_breakdown ?? {},
    routingBreakdown: row.routing_breakdown ?? {},
    queueBreakdown: row.queue_breakdown ?? [],
  }
}

function mapAlert(row: AlertRow): TelephonyAlert {
  return {
    id: row.id,
    ruleKey: row.rule_key,
    severity: row.severity,
    status: row.status,
    title: row.title,
    message: row.message,
    metric: row.metric,
    metricValue: numberValue(row.metric_value),
    threshold: numberValue(row.threshold),
    openedAt: row.opened_at,
    lastObservedAt: row.last_observed_at,
    occurrenceCount: row.occurrence_count,
  }
}

export async function collectTelephonyMonitoringSnapshot(organizationId: string): Promise<string> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.rpc('collect_telephony_monitoring_snapshot', {
    target_organization: organizationId,
  })
  if (error) throw new Error(`Unable to collect telephony monitoring snapshot: ${error.message}`)
  if (typeof data !== 'string') throw new Error('Monitoring collector returned an invalid snapshot identifier.')
  return data
}

export async function getTelephonyMonitoringOverview(organizationId: string): Promise<{
  snapshot: TelephonyMonitoringSnapshot | null
  history: TelephonyMonitoringSnapshot[]
  alerts: TelephonyAlert[]
}> {
  const admin = createTelephonyAdminClient()
  const [{ data: snapshotRows, error: snapshotError }, { data: alertRows, error: alertError }] = await Promise.all([
    admin.from('telephony_monitoring_snapshots').select('*').eq('organization_id', organizationId).order('captured_at', { ascending: false }).limit(24),
    admin.from('telephony_alerts').select('*').eq('organization_id', organizationId).in('status', ['open', 'acknowledged']).order('opened_at', { ascending: false }).limit(50),
  ])
  if (snapshotError) throw new Error(`Unable to load telephony snapshots: ${snapshotError.message}`)
  if (alertError) throw new Error(`Unable to load telephony alerts: ${alertError.message}`)
  const history = ((snapshotRows ?? []) as SnapshotRow[]).map(mapSnapshot)
  return { snapshot: history[0] ?? null, history, alerts: ((alertRows ?? []) as AlertRow[]).map(mapAlert) }
}

export async function getFreshTelephonyMonitoringOverview(organizationId: string): Promise<{
  snapshot: TelephonyMonitoringSnapshot | null
  history: TelephonyMonitoringSnapshot[]
  alerts: TelephonyAlert[]
}> {
  let overview = await getTelephonyMonitoringOverview(organizationId)
  const snapshotAgeMilliseconds = overview.snapshot
    ? Date.now() - new Date(overview.snapshot.capturedAt).getTime()
    : Number.POSITIVE_INFINITY

  if (snapshotAgeMilliseconds > 5 * 60 * 1000) {
    await collectTelephonyMonitoringSnapshot(organizationId)
    overview = await getTelephonyMonitoringOverview(organizationId)
  }

  return overview
}

export async function acknowledgeTelephonyAlert(input: { organizationId: string; alertId: string; userId: string }): Promise<boolean> {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.from('telephony_alerts').update({
    status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: input.userId,
  }).eq('id', input.alertId).eq('organization_id', input.organizationId).eq('status', 'open').select('id').maybeSingle()
  if (error) throw new Error(`Unable to acknowledge telephony alert: ${error.message}`)
  return Boolean(data)
}
