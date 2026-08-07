import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'
import type { PlatformRole } from '@/lib/platform/types'

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

export type PlatformAuditCategory =
  | 'organization'
  | 'subscription'
  | 'billing'
  | 'telephony'
  | 'ai'
  | 'support'

export type PlatformAuditMetrics = {
  eventsLast24Hours: number
  eventsLast7Days: number
  activeActorsLast7Days: number
  organizationsTouchedLast7Days: number
  supportSessionsLast7Days: number
  billingActionsLast7Days: number
  providerActionsLast7Days: number
}

export type PlatformAuditEvent = {
  id: string
  action: string
  category: string
  resourceType: string
  resourceId: string | null
  organizationId: string | null
  organizationName: string | null
  actorUserId: string | null
  actorRole: PlatformRole | null
  actorEmail: string | null
  reason: string | null
  createdAt: string
}

export type PlatformAuditEventDetail = PlatformAuditEvent & {
  previousState: Record<string, unknown> | null
  resultingState: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

export type PlatformAuditDirectory = {
  items: PlatformAuditEvent[]
  total: number
  limit: number
  offset: number
}

function parseRole(value: unknown): PlatformRole | null {
  if (
    value === 'platform_owner' ||
    value === 'platform_admin' ||
    value === 'finance' ||
    value === 'support' ||
    value === 'developer'
  ) {
    return value
  }
  return null
}

function parseEvent(value: unknown): PlatformAuditEvent | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const action = asString(value.action)
  const category = asString(value.category)
  const resourceType = asString(value.resourceType)
  const createdAt = asString(value.createdAt)

  if (!id || !action || !category || !resourceType || !createdAt) {
    return null
  }

  return {
    id,
    action,
    category,
    resourceType,
    resourceId: asString(value.resourceId),
    organizationId: asString(value.organizationId),
    organizationName: asString(value.organizationName),
    actorUserId: asString(value.actorUserId),
    actorRole: parseRole(value.actorRole),
    actorEmail: asString(value.actorEmail),
    reason: asString(value.reason),
    createdAt,
  }
}

export async function getPlatformAuditMetrics(): Promise<PlatformAuditMetrics> {
  await requirePlatformPermission('platform.audit.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_audit_metrics')

  if (error) {
    throw new Error(`Unable to load platform audit metrics: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      eventsLast24Hours: 0,
      eventsLast7Days: 0,
      activeActorsLast7Days: 0,
      organizationsTouchedLast7Days: 0,
      supportSessionsLast7Days: 0,
      billingActionsLast7Days: 0,
      providerActionsLast7Days: 0,
    }
  }

  return {
    eventsLast24Hours: asNumber(data.eventsLast24Hours),
    eventsLast7Days: asNumber(data.eventsLast7Days),
    activeActorsLast7Days: asNumber(data.activeActorsLast7Days),
    organizationsTouchedLast7Days: asNumber(
      data.organizationsTouchedLast7Days,
    ),
    supportSessionsLast7Days: asNumber(data.supportSessionsLast7Days),
    billingActionsLast7Days: asNumber(data.billingActionsLast7Days),
    providerActionsLast7Days: asNumber(data.providerActionsLast7Days),
  }
}

export async function getPlatformAuditEvents(input?: {
  search?: string
  category?: PlatformAuditCategory | 'all'
  actorRole?: PlatformRole | 'all'
  resourceType?: string
  days?: 1 | 7 | 30 | 90 | 0
  limit?: number
  offset?: number
}): Promise<PlatformAuditDirectory> {
  await requirePlatformPermission('platform.audit.view')

  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_audit_event_directory',
    {
      p_search: input?.search?.trim() || null,
      p_category:
        input?.category && input.category !== 'all'
          ? input.category
          : null,
      p_actor_role:
        input?.actorRole && input.actorRole !== 'all'
          ? input.actorRole
          : null,
      p_resource_type: input?.resourceType?.trim() || null,
      p_days: input?.days ?? 30,
      p_limit: limit,
      p_offset: offset,
    },
  )

  if (error) {
    throw new Error(`Unable to load platform audit events: ${error.message}`)
  }

  if (!isRecord(data)) {
    return { items: [], total: 0, limit, offset }
  }

  const rows: unknown[] = Array.isArray(data.items) ? data.items : []

  return {
    items: rows.flatMap((row) => {
      const parsed = parseEvent(row)
      return parsed ? [parsed] : []
    }),
    total: asNumber(data.total),
    limit: asNumber(data.limit) || limit,
    offset: asNumber(data.offset),
  }
}

export async function getPlatformAuditEvent(
  eventId: string,
): Promise<PlatformAuditEventDetail | null> {
  await requirePlatformPermission('platform.audit.view')

  const normalizedId = eventId.trim()
  if (!normalizedId) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_audit_event_detail',
    {
      p_event_id: normalizedId,
    },
  )

  if (error) {
    throw new Error(`Unable to load platform audit event: ${error.message}`)
  }

  if (!isRecord(data)) return null

  const base = parseEvent(data)
  if (!base) return null

  return {
    ...base,
    previousState: isRecord(data.previousState)
      ? data.previousState
      : null,
    resultingState: isRecord(data.resultingState)
      ? data.resultingState
      : null,
    metadata: isRecord(data.metadata) ? data.metadata : {},
  }
}
