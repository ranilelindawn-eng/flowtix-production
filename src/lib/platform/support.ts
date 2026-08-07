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

export type PlatformSupportSession = {
  id: string
  organizationId: string
  organizationName: string
  organizationStatus: string
  reason: string
  reference: string | null
  status: 'active' | 'ended' | 'expired'
  startedAt: string
  expiresAt: string
  endedAt: string | null
  lastAccessedAt: string | null
  accessCount: number
  actorUserId: string
  actorRole: string
  actorEmail: string | null
}

export type PlatformSupportWorkspaceSnapshot = {
  session: PlatformSupportSession
  organization: {
    id: string
    name: string
    slug: string | null
    status: string
    timezone: string
  }
  subscription: {
    status: string | null
    planName: string | null
    planCode: string | null
  }
  counts: {
    members: number
    contacts: number
    campaigns: number
    calls: number
  }
  members: Array<{
    id: string
    fullName: string | null
    email: string | null
    role: string
    status: string
  }>
  recentContacts: Array<{
    id: string
    name: string
    email: string
    phone: string | null
    status: string
    createdAt: string
  }>
  recentCalls: Array<{
    id: string
    direction: string
    status: string
    startedAt: string
    durationSeconds: number | null
    contactName: string | null
  }>
  recentCampaigns: Array<{
    id: string
    name: string
    status: string
    createdAt: string
  }>
}

function parseSession(value: unknown): PlatformSupportSession | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const organizationId = asString(value.organizationId)
  const organizationName = asString(value.organizationName)
  const organizationStatus = asString(value.organizationStatus)
  const reason = asString(value.reason)
  const status = asString(value.status)
  const startedAt = asString(value.startedAt)
  const expiresAt = asString(value.expiresAt)
  const actorUserId = asString(value.actorUserId)
  const actorRole = asString(value.actorRole)

  if (
    !id ||
    !organizationId ||
    !organizationName ||
    !organizationStatus ||
    !reason ||
    (status !== 'active' && status !== 'ended' && status !== 'expired') ||
    !startedAt ||
    !expiresAt ||
    !actorUserId ||
    !actorRole
  ) {
    return null
  }

  return {
    id,
    organizationId,
    organizationName,
    organizationStatus,
    reason,
    reference: asString(value.reference),
    status,
    startedAt,
    expiresAt,
    endedAt: asString(value.endedAt),
    lastAccessedAt: asString(value.lastAccessedAt),
    accessCount: asNumber(value.accessCount),
    actorUserId,
    actorRole,
    actorEmail: asString(value.actorEmail),
  }
}

export async function getPlatformSupportSessions(): Promise<
  PlatformSupportSession[]
> {
  await requirePlatformPermission('platform.impersonation.use')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_support_session_directory',
  )

  if (error) {
    throw new Error(
      `Unable to load support sessions: ${error.message}`,
    )
  }

  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows.flatMap((row) => {
    const parsed = parseSession(row)
    return parsed ? [parsed] : []
  })
}

export async function getPlatformSupportWorkspace(
  sessionId: string,
): Promise<PlatformSupportWorkspaceSnapshot | null> {
  await requirePlatformPermission('platform.impersonation.use')

  const normalizedId = sessionId.trim()
  if (!normalizedId) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_support_workspace_snapshot',
    { p_session_id: normalizedId },
  )

  if (error) {
    throw new Error(
      `Unable to load support workspace: ${error.message}`,
    )
  }

  if (!isRecord(data)) return null

  const session = parseSession(data.session)
  const organization = isRecord(data.organization)
    ? data.organization
    : null
  const counts = isRecord(data.counts) ? data.counts : null
  const subscription = isRecord(data.subscription)
    ? data.subscription
    : {}

  if (
    !session ||
    !organization ||
    !counts ||
    typeof organization.id !== 'string' ||
    typeof organization.name !== 'string' ||
    typeof organization.status !== 'string' ||
    typeof organization.timezone !== 'string'
  ) {
    return null
  }

  const members = Array.isArray(data.members)
    ? data.members.flatMap((value) => {
        if (!isRecord(value)) return []
        const id = asString(value.id)
        const role = asString(value.role)
        const status = asString(value.status)
        if (!id || !role || !status) return []
        return [{
          id,
          fullName: asString(value.fullName),
          email: asString(value.email),
          role,
          status,
        }]
      })
    : []

  const recentContacts = Array.isArray(data.recentContacts)
    ? data.recentContacts.flatMap((value) => {
        if (!isRecord(value)) return []
        const id = asString(value.id)
        const name = asString(value.name)
        const email = asString(value.email)
        const status = asString(value.status)
        const createdAt = asString(value.createdAt)
        if (!id || !name || !email || !status || !createdAt) return []
        return [{
          id,
          name,
          email,
          phone: asString(value.phone),
          status,
          createdAt,
        }]
      })
    : []

  const recentCalls = Array.isArray(data.recentCalls)
    ? data.recentCalls.flatMap((value) => {
        if (!isRecord(value)) return []
        const id = asString(value.id)
        const direction = asString(value.direction)
        const status = asString(value.status)
        const startedAt = asString(value.startedAt)
        if (!id || !direction || !status || !startedAt) return []
        return [{
          id,
          direction,
          status,
          startedAt,
          durationSeconds:
            value.durationSeconds === null ||
            value.durationSeconds === undefined
              ? null
              : asNumber(value.durationSeconds),
          contactName: asString(value.contactName),
        }]
      })
    : []

  const recentCampaigns = Array.isArray(data.recentCampaigns)
    ? data.recentCampaigns.flatMap((value) => {
        if (!isRecord(value)) return []
        const id = asString(value.id)
        const name = asString(value.name)
        const status = asString(value.status)
        const createdAt = asString(value.createdAt)
        if (!id || !name || !status || !createdAt) return []
        return [{ id, name, status, createdAt }]
      })
    : []

  return {
    session,
    organization: {
      id: organization.id,
      name: organization.name,
      slug: asString(organization.slug),
      status: organization.status,
      timezone: organization.timezone,
    },
    subscription: {
      status: asString(subscription.status),
      planName: asString(subscription.planName),
      planCode: asString(subscription.planCode),
    },
    counts: {
      members: asNumber(counts.members),
      contacts: asNumber(counts.contacts),
      campaigns: asNumber(counts.campaigns),
      calls: asNumber(counts.calls),
    },
    members,
    recentContacts,
    recentCalls,
    recentCampaigns,
  }
}
