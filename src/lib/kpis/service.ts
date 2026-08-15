import { requirePermission } from '@/lib/auth'
import { getReportsData, type ReportRange } from '@/lib/reports'
import { createClient } from '@/lib/supabase/server'
import type { KpiDefinition, KpiDirection, KpiOverview, KpiPeriod, KpiSnapshot, KpiValue, KpiValueFormat } from './types'

type DefinitionRow = {
  id: string
  key: string
  name: string
  description: string | null
  category: string
  value_format: KpiValueFormat
  direction: KpiDirection
  target_value: number | string | null
  is_active: boolean
  position: number
}

type SnapshotRow = {
  id: string
  period: KpiPeriod
  period_start: string
  period_end: string
  captured_at: string
}

type ValueRow = {
  definition_id: string
  value: number | string
  previous_value: number | string | null
  change_percent: number | string | null
  kpi_definitions: DefinitionRow | DefinitionRow[] | null
}

const KPI_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000

const standardDefinitions = [
  ['won_revenue', 'Won revenue', 'sales', 'currency', 'higher_is_better'],
  ['pipeline_value', 'Open pipeline', 'sales', 'currency', 'higher_is_better'],
  ['weighted_pipeline_value', 'Weighted pipeline', 'sales', 'currency', 'higher_is_better'],
  ['conversion_rate', 'Conversion rate', 'sales', 'percentage', 'higher_is_better'],
  ['won_deals', 'Won deals', 'sales', 'number', 'higher_is_better'],
  ['open_deals', 'Open deals', 'sales', 'number', 'higher_is_better'],
  ['total_calls', 'Total calls', 'telephony', 'number', 'higher_is_better'],
  ['connect_rate', 'Call connect rate', 'telephony', 'percentage', 'higher_is_better'],
  ['average_call_seconds', 'Average call duration', 'telephony', 'duration', 'higher_is_better'],
  ['total_activities', 'Total activities', 'productivity', 'number', 'higher_is_better'],
  ['completed_tasks', 'Completed tasks', 'productivity', 'number', 'higher_is_better'],
  ['missed_calls', 'Missed calls', 'telephony', 'number', 'lower_is_better'],
] as const satisfies ReadonlyArray<readonly [string, string, string, KpiValueFormat, KpiDirection]>

function numberValue(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function singleDefinition(value: DefinitionRow | DefinitionRow[] | null): DefinitionRow | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function toDefinition(row: DefinitionRow): KpiDefinition {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    valueFormat: row.value_format,
    direction: row.direction,
    targetValue: numberValue(row.target_value),
    isActive: row.is_active,
    position: row.position,
  }
}

function mapValue(row: ValueRow): KpiValue | null {
  const definition = singleDefinition(row.kpi_definitions)
  if (!definition) return null
  const mapped = toDefinition(definition)
  return {
    definitionId: row.definition_id,
    key: mapped.key,
    name: mapped.name,
    category: mapped.category,
    valueFormat: mapped.valueFormat,
    direction: mapped.direction,
    targetValue: mapped.targetValue,
    value: numberValue(row.value) ?? 0,
    previousValue: numberValue(row.previous_value),
    changePercent: numberValue(row.change_percent),
  }
}

async function ensureDefinitions(organizationId: string): Promise<Map<string, DefinitionRow>> {
  const supabase = await createClient()
  const payload = standardDefinitions.map(([key, name, category, valueFormat, direction], position) => ({
    organization_id: organizationId,
    key,
    name,
    category,
    value_format: valueFormat,
    direction,
    position,
    is_active: true,
  }))
  const { data, error } = await supabase
    .from('kpi_definitions')
    .upsert(payload, { onConflict: 'organization_id,key' })
    .select('id,key,name,description,category,value_format,direction,target_value,is_active,position')
  if (error) throw new Error(`Unable to prepare KPI definitions: ${error.message}`)
  return new Map(((data ?? []) as DefinitionRow[]).map((row) => [row.key, row]))
}

export async function collectKpiSnapshot(period: KpiPeriod): Promise<KpiSnapshot> {
  const membership = await requirePermission('reports.view')
  const report = await getReportsData(period as ReportRange)
  const supabase = await createClient()
  const definitions = await ensureDefinitions(membership.organization_id)
  const connectRate = report.totalCalls > 0 ? (report.connectedCalls / report.totalCalls) * 100 : 0
  const totalActivities = report.activity.calls + report.activity.notes + report.activity.tasks + report.activity.emails + report.activity.sms + report.activity.comments
  const values: Record<string, number> = {
    won_revenue: report.totalRevenue,
    pipeline_value: report.pipelineValue,
    weighted_pipeline_value: report.weightedPipelineValue,
    conversion_rate: report.conversionRate,
    won_deals: report.wonDeals,
    open_deals: report.openDeals,
    total_calls: report.totalCalls,
    connect_rate: connectRate,
    average_call_seconds: report.averageCallSeconds,
    total_activities: totalActivities,
    completed_tasks: report.activity.completedTasks,
    missed_calls: report.missedCalls,
  }

  const { data: previous } = await supabase
    .from('kpi_snapshots')
    .select('id')
    .eq('organization_id', membership.organization_id)
    .eq('period', period)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const end = new Date()
  const { data: snapshot, error: snapshotError } = await supabase
    .from('kpi_snapshots')
    .insert({
      organization_id: membership.organization_id,
      period,
      period_start: report.rangeStart,
      period_end: report.rangeEnd,
      previous_snapshot_id: previous?.id ?? null,
      captured_by: membership.user_id,
    })
    .select('id,period,period_start,period_end,captured_at')
    .single()
  if (snapshotError) throw new Error(`Unable to create KPI snapshot: ${snapshotError.message}`)

  let previousValues = new Map<string, number>()
  if (previous?.id) {
    const { data } = await supabase.from('kpi_values').select('definition_id,value').eq('snapshot_id', previous.id)
    previousValues = new Map((data ?? []).map((row) => [String(row.definition_id), Number(row.value)]))
  }

  const insertValues = Object.entries(values).flatMap(([key, value]) => {
    const definition = definitions.get(key)
    if (!definition) return []
    const previousValue = previousValues.get(definition.id)
    const changePercent = previousValue === undefined || previousValue === 0
      ? null
      : ((value - previousValue) / Math.abs(previousValue)) * 100
    return [{
      organization_id: membership.organization_id,
      snapshot_id: snapshot.id,
      definition_id: definition.id,
      value,
      previous_value: previousValue ?? null,
      change_percent: changePercent,
      measured_at: end.toISOString(),
    }]
  })
  const { error: valuesError } = await supabase.from('kpi_values').insert(insertValues)
  if (valuesError) throw new Error(`Unable to store KPI values: ${valuesError.message}`)

  const definitionsById = new Map(Array.from(definitions.values()).map((definition) => [definition.id, definition]))
  const snapshotValues: KpiValue[] = insertValues.flatMap((row) => {
    const definition = definitionsById.get(row.definition_id)
    if (!definition) return []
    const mapped = toDefinition(definition)
    return [{
      definitionId: row.definition_id,
      key: mapped.key,
      name: mapped.name,
      category: mapped.category,
      valueFormat: mapped.valueFormat,
      direction: mapped.direction,
      targetValue: mapped.targetValue,
      value: row.value,
      previousValue: row.previous_value,
      changePercent: row.change_percent,
    }]
  })

  snapshotValues.sort((a, b) => standardDefinitions.findIndex(([key]) => key === a.key) - standardDefinitions.findIndex(([key]) => key === b.key))

  return {
    id: snapshot.id,
    period: snapshot.period as KpiPeriod,
    periodStart: snapshot.period_start,
    periodEnd: snapshot.period_end,
    capturedAt: snapshot.captured_at,
    values: snapshotValues,
  }
}

export async function getKpiOverview(period: KpiPeriod, collectWhenMissing = true): Promise<KpiOverview> {
  const membership = await requirePermission('reports.view')
  const supabase = await createClient()
  const { data: snapshots, error } = await supabase
    .from('kpi_snapshots')
    .select('id,period,period_start,period_end,captured_at')
    .eq('organization_id', membership.organization_id)
    .eq('period', period)
    .order('captured_at', { ascending: false })
    .limit(12)
  if (error) throw new Error(`Unable to load KPI snapshots: ${error.message}`)
  if ((!snapshots || snapshots.length === 0) && collectWhenMissing) {
    const snapshot = await collectKpiSnapshot(period)
    return { snapshot, history: [snapshot] }
  }

  const current = (snapshots?.[0] ?? null) as SnapshotRow | null
  if (!current) return { snapshot: null, history: [] }

  if (collectWhenMissing) {
    const capturedAt = new Date(current.captured_at).getTime()
    const snapshotIsStale =
      !Number.isFinite(capturedAt) ||
      Date.now() - capturedAt >= KPI_SNAPSHOT_MAX_AGE_MS

    if (snapshotIsStale) {
      const snapshot = await collectKpiSnapshot(period)
      return {
        snapshot,
        history: [
          snapshot,
          ...((snapshots ?? []) as SnapshotRow[]).map((row) => ({
            id: row.id,
            period: row.period,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            capturedAt: row.captured_at,
          })),
        ].slice(0, 12),
      }
    }
  }
  const { data: valueRows, error: valueError } = await supabase
    .from('kpi_values')
    .select('definition_id,value,previous_value,change_percent,kpi_definitions(id,key,name,description,category,value_format,direction,target_value,is_active,position)')
    .eq('snapshot_id', current.id)
  if (valueError) throw new Error(`Unable to load KPI values: ${valueError.message}`)
  const values = ((valueRows ?? []) as ValueRow[]).map(mapValue).filter((value): value is KpiValue => value !== null)
  values.sort((a, b) => standardDefinitions.findIndex(([key]) => key === a.key) - standardDefinitions.findIndex(([key]) => key === b.key))
  return {
    snapshot: {
      id: current.id,
      period: current.period,
      periodStart: current.period_start,
      periodEnd: current.period_end,
      capturedAt: current.captured_at,
      values,
    },
    history: ((snapshots ?? []) as SnapshotRow[]).map((row) => ({
      id: row.id,
      period: row.period,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      capturedAt: row.captured_at,
    })),
  }
}