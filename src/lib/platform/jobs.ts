import 'server-only'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'
import type { JobStatus } from '@/lib/jobs/types'

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

export type PlatformJobMetrics = {
  queued: number
  scheduled: number
  processing: number
  retrying: number
  completedLast24Hours: number
  failedLast24Hours: number
  deadLetter: number
  cancelledLast24Hours: number
  staleProcessing: number
  queues: number
}

export type PlatformJobRow = {
  id: string
  organizationId: string | null
  organizationName: string | null
  queue: string
  jobType: string
  status: JobStatus
  priority: number
  attemptCount: number
  maxAttempts: number
  scheduledAt: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  nextRetryAt: string | null
  lockedBy: string | null
  heartbeatAt: string | null
  lockExpiresAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type PlatformJobEvent = {
  id: string
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  workerId: string | null
  message: string | null
  metadata: Record<string, unknown>
  createdBy: string | null
  createdAt: string
}

export type PlatformJobDetail = PlatformJobRow & {
  stale: boolean
  idempotencyKey: string | null
  payload: Record<string, unknown> | unknown[] | null
  result: Record<string, unknown> | unknown[] | null
  partitionKey: string | null
  events: PlatformJobEvent[]
}

export type PlatformJobDirectory = {
  items: PlatformJobRow[]
  total: number
  limit: number
  offset: number
  queues: string[]
  jobTypes: string[]
}

function parseStatus(value: unknown): JobStatus | null {
  if (
    value === 'queued' ||
    value === 'scheduled' ||
    value === 'processing' ||
    value === 'retrying' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'dead_letter'
  ) {
    return value
  }
  return null
}

function parseJob(value: unknown): PlatformJobRow | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const queue = asString(value.queue)
  const jobType = asString(value.jobType)
  const status = parseStatus(value.status)
  const scheduledAt = asString(value.scheduledAt)
  const createdAt = asString(value.createdAt)
  const updatedAt = asString(value.updatedAt)

  if (
    !id ||
    !queue ||
    !jobType ||
    !status ||
    !scheduledAt ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  return {
    id,
    organizationId: asString(value.organizationId),
    organizationName: asString(value.organizationName),
    queue,
    jobType,
    status,
    priority: asNumber(value.priority),
    attemptCount: asNumber(value.attemptCount),
    maxAttempts: asNumber(value.maxAttempts),
    scheduledAt,
    startedAt: asString(value.startedAt),
    completedAt: asString(value.completedAt),
    failedAt: asString(value.failedAt),
    nextRetryAt: asString(value.nextRetryAt),
    lockedBy: asString(value.lockedBy),
    heartbeatAt: asString(value.heartbeatAt),
    lockExpiresAt: asString(value.lockExpiresAt),
    lastErrorCode: asString(value.lastErrorCode),
    lastErrorMessage: asString(value.lastErrorMessage),
    createdAt,
    updatedAt,
  }
}

function parseEvent(value: unknown): PlatformJobEvent | null {
  if (!isRecord(value)) return null

  const id = asString(value.id)
  const eventType = asString(value.eventType)
  const createdAt = asString(value.createdAt)

  if (!id || !eventType || !createdAt) return null

  return {
    id,
    eventType,
    fromStatus: asString(value.fromStatus),
    toStatus: asString(value.toStatus),
    workerId: asString(value.workerId),
    message: asString(value.message),
    metadata: isRecord(value.metadata) ? value.metadata : {},
    createdBy: asString(value.createdBy),
    createdAt,
  }
}

export async function getPlatformJobMetrics(): Promise<PlatformJobMetrics> {
  await requirePlatformPermission('platform.jobs.view')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_job_metrics')

  if (error) {
    throw new Error(`Unable to load platform job metrics: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      queued: 0,
      scheduled: 0,
      processing: 0,
      retrying: 0,
      completedLast24Hours: 0,
      failedLast24Hours: 0,
      deadLetter: 0,
      cancelledLast24Hours: 0,
      staleProcessing: 0,
      queues: 0,
    }
  }

  return {
    queued: asNumber(data.queued),
    scheduled: asNumber(data.scheduled),
    processing: asNumber(data.processing),
    retrying: asNumber(data.retrying),
    completedLast24Hours: asNumber(data.completedLast24Hours),
    failedLast24Hours: asNumber(data.failedLast24Hours),
    deadLetter: asNumber(data.deadLetter),
    cancelledLast24Hours: asNumber(data.cancelledLast24Hours),
    staleProcessing: asNumber(data.staleProcessing),
    queues: asNumber(data.queues),
  }
}

export async function getPlatformJobs(input?: {
  search?: string
  status?: JobStatus | 'all'
  queue?: string
  jobType?: string
  limit?: number
  offset?: number
}): Promise<PlatformJobDirectory> {
  await requirePlatformPermission('platform.jobs.view')

  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100)
  const offset = Math.max(input?.offset ?? 0, 0)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_job_directory',
    {
      p_search: input?.search?.trim() || null,
      p_status:
        input?.status && input.status !== 'all'
          ? input.status
          : null,
      p_queue: input?.queue?.trim() || null,
      p_job_type: input?.jobType?.trim() || null,
      p_limit: limit,
      p_offset: offset,
    },
  )

  if (error) {
    throw new Error(`Unable to load platform jobs: ${error.message}`)
  }

  if (!isRecord(data)) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      queues: [],
      jobTypes: [],
    }
  }

  const rows: unknown[] = Array.isArray(data.items) ? data.items : []

  return {
    items: rows.flatMap((row) => {
      const parsed = parseJob(row)
      return parsed ? [parsed] : []
    }),
    total: asNumber(data.total),
    limit: asNumber(data.limit) || limit,
    offset: asNumber(data.offset),
    queues: Array.isArray(data.queues)
      ? data.queues.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    jobTypes: Array.isArray(data.jobTypes)
      ? data.jobTypes.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  }
}

export async function getPlatformJob(
  jobId: string,
): Promise<PlatformJobDetail | null> {
  await requirePlatformPermission('platform.jobs.view')

  const normalizedId = jobId.trim()
  if (!normalizedId) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'platform_job_detail',
    { p_job_id: normalizedId },
  )

  if (error) {
    throw new Error(`Unable to load platform job: ${error.message}`)
  }

  if (!isRecord(data)) return null

  const base = parseJob(data)
  if (!base) return null

  const events: unknown[] = Array.isArray(data.events) ? data.events : []

  const lockExpiresAt = asString(data.lockExpiresAt)
  const stale =
    base.status === 'processing' &&
    Boolean(lockExpiresAt) &&
    new Date(lockExpiresAt ?? '').getTime() <= Date.now()

  return {
    ...base,
    stale,
    idempotencyKey: asString(data.idempotencyKey),
    payload:
      isRecord(data.payload) || Array.isArray(data.payload)
        ? data.payload
        : null,
    result:
      isRecord(data.result) || Array.isArray(data.result)
        ? data.result
        : null,
    partitionKey: asString(data.partitionKey),
    events: events.flatMap((event) => {
      const parsed = parseEvent(event)
      return parsed ? [parsed] : []
    }),
  }
}
