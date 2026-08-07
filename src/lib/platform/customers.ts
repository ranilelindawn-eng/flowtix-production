import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

export type PlatformCustomerStatus =
  | 'active'
  | 'suspended'
  | 'archived'

export type PlatformCustomerOwner = {
  userId: string
  email: string | null
  fullName: string | null
}

export type PlatformCustomerSubscription = {
  id: string
  status: string
  planCode: string | null
  planName: string | null
  monthlyPriceCents: number | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  lastPaymentStatus: string | null
  billingProvider: string | null
}

export type PlatformCustomerUsage = {
  aiRequests: number
  emails: number
  sms: number
}

export type PlatformCustomerSummary = {
  id: string
  name: string
  slug: string | null
  status: PlatformCustomerStatus
  timezone: string
  createdAt: string
  updatedAt: string
  memberCount: number
  suspendedMemberCount: number
  owner: PlatformCustomerOwner | null
  subscription: PlatformCustomerSubscription | null
  usage: PlatformCustomerUsage
}

export type PlatformCustomerMember = {
  id: string
  userId: string
  role: string
  status: string
  email: string | null
  fullName: string | null
  createdAt: string
}

export type PlatformCustomerDetail = PlatformCustomerSummary & {
  createdBy: PlatformCustomerOwner | null
  members: PlatformCustomerMember[]
  counts: {
    contacts: number
    calls: number
    campaigns: number
  }
}

export type PlatformCustomerDirectory = {
  items: PlatformCustomerSummary[]
  total: number
  limit: number
  offset: number
}

export type PlatformCustomerMetrics = {
  totalOrganizations: number
  activeOrganizations: number
  suspendedOrganizations: number
  totalUsers: number
  activeSubscriptions: number
  trialCustomers: number
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function parseStatus(value: unknown): PlatformCustomerStatus {
  if (value === 'suspended' || value === 'archived') return value
  return 'active'
}

function parseOwner(value: unknown): PlatformCustomerOwner | null {
  if (!isRecord(value)) return null
  const userId = asString(value.userId)
  if (!userId) return null
  return {
    userId,
    email: asString(value.email),
    fullName: asString(value.fullName),
  }
}

function parseSubscription(
  value: unknown,
): PlatformCustomerSubscription | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const status = asString(value.status)
  if (!id || !status) return null

  return {
    id,
    status,
    planCode: asString(value.planCode),
    planName: asString(value.planName),
    monthlyPriceCents:
      value.monthlyPriceCents === null ||
      value.monthlyPriceCents === undefined
        ? null
        : asNumber(value.monthlyPriceCents),
    currentPeriodEnd: asString(value.currentPeriodEnd),
    cancelAtPeriodEnd: asBoolean(value.cancelAtPeriodEnd),
    lastPaymentStatus: asString(value.lastPaymentStatus),
    billingProvider: asString(value.billingProvider),
  }
}

function parseUsage(value: unknown): PlatformCustomerUsage {
  if (!isRecord(value)) {
    return { aiRequests: 0, emails: 0, sms: 0 }
  }

  return {
    aiRequests: asNumber(value.aiRequests),
    emails: asNumber(value.emails),
    sms: asNumber(value.sms),
  }
}

function parseSummary(value: unknown): PlatformCustomerSummary | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const name = asString(value.name)
  const timezone = asString(value.timezone)
  const createdAt = asString(value.createdAt)
  const updatedAt = asString(value.updatedAt)

  if (!id || !name || !timezone || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    name,
    slug: asString(value.slug),
    status: parseStatus(value.status),
    timezone,
    createdAt,
    updatedAt,
    memberCount: asNumber(value.memberCount),
    suspendedMemberCount: asNumber(value.suspendedMemberCount),
    owner: parseOwner(value.owner),
    subscription: parseSubscription(value.subscription),
    usage: parseUsage(value.usage),
  }
}

function parseMember(value: unknown): PlatformCustomerMember | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const userId = asString(value.userId)
  const role = asString(value.role)
  const status = asString(value.status)
  const createdAt = asString(value.createdAt)

  if (!id || !userId || !role || !status || !createdAt) return null

  return {
    id,
    userId,
    role,
    status,
    email: asString(value.email),
    fullName: asString(value.fullName),
    createdAt,
  }
}

export async function getPlatformCustomers(input?: {
  search?: string
  status?: PlatformCustomerStatus | 'all'
  limit?: number
  offset?: number
}): Promise<PlatformCustomerDirectory> {
  await requirePlatformPermission('platform.customers.view')

  const search = input?.search?.trim() ?? ''
  const status = input?.status ?? 'all'
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_customer_directory',
    {
      p_search: search || null,
      p_status: status === 'all' ? null : status,
      p_limit: limit,
      p_offset: offset,
    },
  )

  if (error) {
    throw new Error(`Unable to load platform customers: ${error.message}`)
  }

  if (!isRecord(data)) {
    return { items: [], total: 0, limit, offset }
  }

  const rawItems = Array.isArray(data.items) ? data.items : []

  return {
    items: rawItems.flatMap((row) => {
      const parsed = parseSummary(row)
      return parsed ? [parsed] : []
    }),
    total: asNumber(data.total),
    limit: asNumber(data.limit) || limit,
    offset: asNumber(data.offset),
  }
}

export async function getPlatformCustomer(
  organizationId: string,
): Promise<PlatformCustomerDetail | null> {
  await requirePlatformPermission('platform.customers.view')

  const normalizedId = organizationId.trim()
  if (!normalizedId) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_customer_detail',
    { p_organization_id: normalizedId },
  )

  if (error) {
    throw new Error(`Unable to load platform customer: ${error.message}`)
  }

  if (!isRecord(data)) return null
  const summary = parseSummary(data)
  if (!summary) return null

  const members = Array.isArray(data.members)
    ? data.members.flatMap((row) => {
        const parsed = parseMember(row)
        return parsed ? [parsed] : []
      })
    : []

  const countsValue = isRecord(data.counts) ? data.counts : {}

  return {
    ...summary,
    createdBy: parseOwner(data.createdBy),
    members,
    counts: {
      contacts: asNumber(countsValue.contacts),
      calls: asNumber(countsValue.calls),
      campaigns: asNumber(countsValue.campaigns),
    },
  }
}

export async function getPlatformCustomerMetrics(): Promise<PlatformCustomerMetrics> {
  await requirePlatformPermission('platform.customers.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_customer_metrics',
  )

  if (error) {
    throw new Error(`Unable to load customer metrics: ${error.message}`)
  }

  const value = isRecord(data) ? data : {}

  return {
    totalOrganizations: asNumber(value.totalOrganizations),
    activeOrganizations: asNumber(value.activeOrganizations),
    suspendedOrganizations: asNumber(value.suspendedOrganizations),
    totalUsers: asNumber(value.totalUsers),
    activeSubscriptions: asNumber(value.activeSubscriptions),
    trialCustomers: asNumber(value.trialCustomers),
  }
}
