import { createClient } from '@/lib/supabase/server'
import type {
  BackgroundJob,
  EnqueueJobInput,
  JsonValue,
} from '@/lib/jobs/types'

function normalizeScheduledAt(value: Date | string | undefined) {
  if (!value) {
    return new Date().toISOString()
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error('The scheduled job date is invalid.')
  }

  return date.toISOString()
}

function parseJob(value: unknown): BackgroundJob {
  if (!value || typeof value !== 'object') {
    throw new Error('The job queue returned an invalid job record.')
  }

  return value as BackgroundJob
}

export async function enqueueJob(
  input: EnqueueJobInput,
): Promise<BackgroundJob> {
  const queue = input.queue.trim()
  const jobType = input.jobType.trim()

  if (!input.organizationId.trim()) {
    throw new Error('Organization ID is required.')
  }

  if (!queue) {
    throw new Error('Queue is required.')
  }

  if (!jobType) {
    throw new Error('Job type is required.')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'enqueue_background_job',
    {
      p_organization_id: input.organizationId,
      p_queue: queue,
      p_job_type: jobType,
      p_payload: (input.payload ?? {}) as JsonValue,
      p_scheduled_at: normalizeScheduledAt(input.scheduledAt),
      p_priority: input.priority ?? 100,
      p_max_attempts: input.maxAttempts ?? 5,
      p_idempotency_key:
        input.idempotencyKey?.trim() || null,
    },
  )

  if (error) {
    throw new Error(`Unable to enqueue job: ${error.message}`)
  }

  return parseJob(data)
}
