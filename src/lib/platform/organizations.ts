import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import {
  getPlatformCustomer,
  getPlatformCustomers,
  type PlatformCustomerDetail,
  type PlatformCustomerDirectory,
  type PlatformCustomerStatus,
} from '@/lib/platform/customers'
import { createClient } from '@/lib/supabase/server'

export type PlatformOrganizationLifecycleEvent = {
  id: string
  eventType: string
  reason: string | null
  previousStatus: string | null
  resultingStatus: string | null
  actorUserId: string | null
  actorRole: string | null
  actorEmail: string | null
  createdAt: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseLifecycleEvent(
  value: unknown,
): PlatformOrganizationLifecycleEvent | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const eventType = asString(value.eventType)
  const createdAt = asString(value.createdAt)

  if (!id || !eventType || !createdAt) return null

  return {
    id,
    eventType,
    reason: asString(value.reason),
    previousStatus: asString(value.previousStatus),
    resultingStatus: asString(value.resultingStatus),
    actorUserId: asString(value.actorUserId),
    actorRole: asString(value.actorRole),
    actorEmail: asString(value.actorEmail),
    createdAt,
  }
}

export async function getPlatformOrganizations(input?: {
  search?: string
  status?: PlatformCustomerStatus | 'all'
  limit?: number
  offset?: number
}): Promise<PlatformCustomerDirectory> {
  await requirePlatformPermission('platform.organizations.manage')
  return getPlatformCustomers(input)
}

export async function getPlatformOrganization(
  organizationId: string,
): Promise<PlatformCustomerDetail | null> {
  await requirePlatformPermission('platform.organizations.manage')
  return getPlatformCustomer(organizationId)
}

export async function getPlatformOrganizationLifecycle(
  organizationId: string,
): Promise<PlatformOrganizationLifecycleEvent[]> {
  await requirePlatformPermission('platform.organizations.manage')

  const normalizedId = organizationId.trim()
  if (!normalizedId) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_organization_lifecycle',
    { p_organization_id: normalizedId },
  )

  if (error) {
    throw new Error(
      `Unable to load organization lifecycle: ${error.message}`,
    )
  }

  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows.flatMap((row) => {
    const parsed = parseLifecycleEvent(row)
    return parsed ? [parsed] : []
  })
}
