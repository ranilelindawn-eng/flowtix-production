export const JOB_STATUSES = [
  'queued',
  'scheduled',
  'processing',
  'retrying',
  'completed',
  'failed',
  'cancelled',
  'dead_letter',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type BackgroundJob = {
  id: string
  organization_id: string | null
  queue: string
  job_type: string
  payload: JsonValue
  status: JobStatus
  priority: number
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  attempt_count: number
  max_attempts: number
  next_retry_at: string | null
  locked_by: string | null
  locked_at: string | null
  heartbeat_at: string | null
  lock_expires_at: string | null
  idempotency_key: string | null
  last_error_code: string | null
  last_error_message: string | null
  result: JsonValue | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EnqueueJobInput = {
  organizationId: string
  queue: string
  jobType: string
  payload?: JsonValue
  scheduledAt?: Date | string
  priority?: number
  maxAttempts?: number
  idempotencyKey?: string
}

export type JobHandlerContext = {
  workerId: string
  job: BackgroundJob
  heartbeat: () => Promise<void>
}

export type JobHandlerResult = JsonValue | void

export type JobHandler = (
  context: JobHandlerContext,
) => Promise<JobHandlerResult>

export class NonRetryableJobError extends Error {
  readonly code: string

  constructor(message: string, code = 'NON_RETRYABLE') {
    super(message)
    this.name = 'NonRetryableJobError'
    this.code = code
  }
}
