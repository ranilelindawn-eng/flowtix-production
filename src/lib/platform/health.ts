import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, unknown>

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return 0
}

export type PlatformHealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'unknown'

export type PlatformHealthComponent = {
  key: string
  label: string
  status: PlatformHealthStatus
  summary: string
  details: Record<string, number | string | boolean | null>
}

export type PlatformHealthIncident = {
  key: string
  severity: 'warning' | 'critical'
  title: string
  detail: string
  resourceType: string | null
  resourceId: string | null
  organizationId: string | null
  organizationName: string | null
  occurredAt: string | null
}

export type PlatformHealthOverview = {
  status: PlatformHealthStatus
  score: number
  checkedAt: string
  components: PlatformHealthComponent[]
  incidents: PlatformHealthIncident[]
}

function parseStatus(value: unknown): PlatformHealthStatus {
  if (
    value === 'healthy' ||
    value === 'warning' ||
    value === 'critical' ||
    value === 'unknown'
  ) {
    return value
  }
  return 'unknown'
}

function parseComponent(value: unknown): PlatformHealthComponent | null {
  if (!isRecord(value)) return null

  const key = asString(value.key)
  const label = asString(value.label)
  const summary = asString(value.summary)

  if (!key || !label || !summary) return null

  const rawDetails = isRecord(value.details) ? value.details : {}
  const details: Record<string, number | string | boolean | null> = {}

  for (const [detailKey, detailValue] of Object.entries(rawDetails)) {
    if (
      typeof detailValue === 'string' ||
      typeof detailValue === 'number' ||
      typeof detailValue === 'boolean' ||
      detailValue === null
    ) {
      details[detailKey] = detailValue
    }
  }

  return {
    key,
    label,
    status: parseStatus(value.status),
    summary,
    details,
  }
}

function parseIncident(value: unknown): PlatformHealthIncident | null {
  if (!isRecord(value)) return null

  const key = asString(value.key)
  const severity = asString(value.severity)
  const title = asString(value.title)
  const detail = asString(value.detail)

  if (
    !key ||
    (severity !== 'warning' && severity !== 'critical') ||
    !title ||
    !detail
  ) {
    return null
  }

  return {
    key,
    severity,
    title,
    detail,
    resourceType: asString(value.resourceType),
    resourceId: asString(value.resourceId),
    organizationId: asString(value.organizationId),
    organizationName: asString(value.organizationName),
    occurredAt: asString(value.occurredAt),
  }
}

export async function getPlatformHealthOverview(): Promise<PlatformHealthOverview> {
  await requirePlatformPermission('platform.jobs.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_system_health_overview')

  if (error) {
    throw new Error(`Unable to load platform system health: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      status: 'unknown',
      score: 0,
      checkedAt: new Date().toISOString(),
      components: [],
      incidents: [],
    }
  }

  const componentRows: unknown[] = Array.isArray(data.components)
    ? data.components
    : []
  const incidentRows: unknown[] = Array.isArray(data.incidents)
    ? data.incidents
    : []

  return {
    status: parseStatus(data.status),
    score: asNumber(data.score),
    checkedAt: asString(data.checkedAt) ?? new Date().toISOString(),
    components: componentRows.flatMap((row) => {
      const parsed = parseComponent(row)
      return parsed ? [parsed] : []
    }),
    incidents: incidentRows.flatMap((row) => {
      const parsed = parseIncident(row)
      return parsed ? [parsed] : []
    }),
  }
}
