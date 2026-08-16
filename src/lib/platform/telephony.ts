
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

const asBoolean = (value: unknown): boolean => value === true

export type PlatformTelephonyProvider = 'signalwire'

export type PlatformTelephonyMetrics = {
  connectedIntegrations: number
  enabledIntegrations: number
  organizationsWithTelephony: number
  phoneNumbers: number
  providerErrorsLast24Hours: number
  callsLast24Hours: number
  failedCallsLast24Hours: number
  verificationFailuresLast24Hours: number
}

export type PlatformTelephonyConnection = {
  id: string
  organizationId: string
  organizationName: string
  organizationStatus: string
  provider: PlatformTelephonyProvider
  enabled: boolean
  status: string
  connectedAt: string | null
  connectedBy: string | null
  lastError: string | null
  updatedAt: string
  phoneNumberCount: number
  defaultPhoneNumber: string | null
  callsLast24Hours: number
  providerErrorsLast24Hours: number
  lastProviderEventAt: string | null
  lastVerificationStatus: string | null
  lastVerificationAt: string | null
}

export type PlatformTelephonyNumber = {
  id: string
  phoneNumber: string
  friendlyName: string
  isDefault: boolean
  recordingEnabled: boolean
  capabilities: Record<string, boolean>
  createdAt: string
}

export type PlatformTelephonyEvent = {
  id: string
  providerEventId: string
  eventType: string
  providerCallId: string | null
  normalizedStatus: string | null
  rawStatus: string
  occurredAt: string
}

export type PlatformTelephonyHealthCheck = {
  id: string
  status: string
  message: string
  actorUserId: string | null
  actorRole: string | null
  createdAt: string
}

export type PlatformTelephonyConnectionDetail =
  PlatformTelephonyConnection & {
    configSummary: Record<string, unknown>
    numbers: PlatformTelephonyNumber[]
    recentEvents: PlatformTelephonyEvent[]
    healthChecks: PlatformTelephonyHealthCheck[]
  }

export type PlatformTelephonyDirectory = {
  items: PlatformTelephonyConnection[]
  total: number
  limit: number
  offset: number
}

function parseProvider(value: unknown): PlatformTelephonyProvider | null {
  if (value === 'signalwire') {
    return value
  }
  return null
}

function parseConnection(value: unknown): PlatformTelephonyConnection | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const organizationId = asString(value.organizationId)
  const organizationName = asString(value.organizationName)
  const organizationStatus = asString(value.organizationStatus)
  const provider = parseProvider(value.provider)
  const status = asString(value.status)
  const updatedAt = asString(value.updatedAt)

  if (
    !id ||
    !organizationId ||
    !organizationName ||
    !organizationStatus ||
    !provider ||
    !status ||
    !updatedAt
  ) {
    return null
  }

  return {
    id,
    organizationId,
    organizationName,
    organizationStatus,
    provider,
    enabled: asBoolean(value.enabled),
    status,
    connectedAt: asString(value.connectedAt),
    connectedBy: asString(value.connectedBy),
    lastError: asString(value.lastError),
    updatedAt,
    phoneNumberCount: asNumber(value.phoneNumberCount),
    defaultPhoneNumber: asString(value.defaultPhoneNumber),
    callsLast24Hours: asNumber(value.callsLast24Hours),
    providerErrorsLast24Hours: asNumber(value.providerErrorsLast24Hours),
    lastProviderEventAt: asString(value.lastProviderEventAt),
    lastVerificationStatus: asString(value.lastVerificationStatus),
    lastVerificationAt: asString(value.lastVerificationAt),
  }
}

function parseNumber(value: unknown): PlatformTelephonyNumber | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const phoneNumber = asString(value.phoneNumber)
  const friendlyName = asString(value.friendlyName)
  const createdAt = asString(value.createdAt)

  if (!id || !phoneNumber || !friendlyName || !createdAt) return null

  const rawCapabilities = isRecord(value.capabilities)
    ? value.capabilities
    : {}

  const capabilities = Object.fromEntries(
    Object.entries(rawCapabilities).flatMap(([key, capability]) =>
      typeof capability === 'boolean' ? [[key, capability]] : [],
    ),
  )

  return {
    id,
    phoneNumber,
    friendlyName,
    isDefault: asBoolean(value.isDefault),
    recordingEnabled: asBoolean(value.recordingEnabled),
    capabilities,
    createdAt,
  }
}

function parseEvent(value: unknown): PlatformTelephonyEvent | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const providerEventId = asString(value.providerEventId)
  const eventType = asString(value.eventType)
  const rawStatus = asString(value.rawStatus)
  const occurredAt = asString(value.occurredAt)

  if (!id || !providerEventId || !eventType || rawStatus === null || !occurredAt) {
    return null
  }

  return {
    id,
    providerEventId,
    eventType,
    providerCallId: asString(value.providerCallId),
    normalizedStatus: asString(value.normalizedStatus),
    rawStatus,
    occurredAt,
  }
}

function parseHealthCheck(value: unknown): PlatformTelephonyHealthCheck | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const status = asString(value.status)
  const message = asString(value.message)
  const createdAt = asString(value.createdAt)

  if (!id || !status || !message || !createdAt) return null

  return {
    id,
    status,
    message,
    actorUserId: asString(value.actorUserId),
    actorRole: asString(value.actorRole),
    createdAt,
  }
}

export async function getPlatformTelephonyMetrics(): Promise<PlatformTelephonyMetrics> {
  await requirePlatformPermission('platform.telephony.manage')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_telephony_metrics')

  if (error) {
    throw new Error(`Unable to load platform telephony metrics: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      connectedIntegrations: 0,
      enabledIntegrations: 0,
      organizationsWithTelephony: 0,
      phoneNumbers: 0,
      providerErrorsLast24Hours: 0,
      callsLast24Hours: 0,
      failedCallsLast24Hours: 0,
      verificationFailuresLast24Hours: 0,
    }
  }

  return {
    connectedIntegrations: asNumber(data.connectedIntegrations),
    enabledIntegrations: asNumber(data.enabledIntegrations),
    organizationsWithTelephony: asNumber(data.organizationsWithTelephony),
    phoneNumbers: asNumber(data.phoneNumbers),
    providerErrorsLast24Hours: asNumber(data.providerErrorsLast24Hours),
    callsLast24Hours: asNumber(data.callsLast24Hours),
    failedCallsLast24Hours: asNumber(data.failedCallsLast24Hours),
    verificationFailuresLast24Hours: asNumber(
      data.verificationFailuresLast24Hours,
    ),
  }
}

export async function getPlatformTelephonyConnections(input?: {
  search?: string
  provider?: PlatformTelephonyProvider | 'all'
  status?: string
  limit?: number
  offset?: number
}): Promise<PlatformTelephonyDirectory> {
  await requirePlatformPermission('platform.telephony.manage')

  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)
  const search = input?.search?.trim() ?? ''
  const provider = input?.provider ?? 'all'
  const status = input?.status?.trim() ?? 'all'

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_telephony_connection_directory',
    {
      p_search: search || null,
      p_provider: provider === 'all' ? 'signalwire' : provider,
      p_status: status === 'all' ? null : status,
      p_limit: limit,
      p_offset: offset,
    },
  )

  if (error) {
    throw new Error(
      `Unable to load platform telephony connections: ${error.message}`,
    )
  }

  if (!isRecord(data)) {
    return { items: [], total: 0, limit, offset }
  }

  const rows: unknown[] = Array.isArray(data.items) ? data.items : []

  return {
    items: rows.flatMap((row) => {
      const parsed = parseConnection(row)
      return parsed ? [parsed] : []
    }),
    total: asNumber(data.total),
    limit: asNumber(data.limit) || limit,
    offset: asNumber(data.offset),
  }
}

export async function getPlatformTelephonyConnection(
  integrationId: string,
): Promise<PlatformTelephonyConnectionDetail | null> {
  await requirePlatformPermission('platform.telephony.manage')

  const normalizedId = integrationId.trim()
  if (!normalizedId) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_telephony_connection_detail',
    {
      p_integration_id: normalizedId,
    },
  )

  if (error) {
    throw new Error(
      `Unable to load platform telephony connection: ${error.message}`,
    )
  }

  if (!isRecord(data)) return null

  const base = parseConnection(data)
  if (!base) return null

  const numberRows: unknown[] = Array.isArray(data.numbers)
    ? data.numbers
    : []
  const eventRows: unknown[] = Array.isArray(data.recentEvents)
    ? data.recentEvents
    : []
  const healthRows: unknown[] = Array.isArray(data.healthChecks)
    ? data.healthChecks
    : []

  return {
    ...base,
    configSummary: isRecord(data.configSummary) ? data.configSummary : {},
    numbers: numberRows.flatMap((row) => {
      const parsed = parseNumber(row)
      return parsed ? [parsed] : []
    }),
    recentEvents: eventRows.flatMap((row) => {
      const parsed = parseEvent(row)
      return parsed ? [parsed] : []
    }),
    healthChecks: healthRows.flatMap((row) => {
      const parsed = parseHealthCheck(row)
      return parsed ? [parsed] : []
    }),
  }
}
