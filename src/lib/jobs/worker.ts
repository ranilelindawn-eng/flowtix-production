import { createClient } from '@supabase/supabase-js'

import { getJobHandler } from '@/lib/jobs/handlers'
import {
  NonRetryableJobError,
  type BackgroundJob,
  type JsonValue,
} from '@/lib/jobs/types'

const DEFAULT_QUEUES = [
  'default',
  'communications',
  'sequences',
  'campaigns',
  'telephony',
  'transcription',
  'ai',
  'calendar_sync',
  'oauth_refresh',
  'reports',
  'imports',
  'webhooks',
  'maintenance',
]

function createWorkerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase service-role configuration for the job worker.',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function parseJobs(value: unknown): BackgroundJob[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (item): item is BackgroundJob =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as BackgroundJob).id === 'string',
  )
}

function getErrorDetails(error: unknown) {
  if (error instanceof NonRetryableJobError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    }
  }

  if (error instanceof Error) {
    return {
      code: error.name || 'JOB_ERROR',
      message: error.message,
      retryable: true,
    }
  }

  return {
    code: 'UNKNOWN_JOB_ERROR',
    message: 'The job failed with an unknown error.',
    retryable: true,
  }
}

export type ProcessJobsOptions = {
  workerId: string
  queues?: string[]
  limit?: number
  leaseSeconds?: number
}

export type ProcessJobsResult = {
  claimed: number
  completed: number
  retried: number
  failed: number
  deadLettered: number
  jobs: Array<{
    id: string
    jobType: string
    status: string
    error?: string
  }>
}

export async function processJobs(
  options: ProcessJobsOptions,
): Promise<ProcessJobsResult> {
  const workerId = options.workerId.trim()

  if (!workerId) {
    throw new Error('Worker ID is required.')
  }

  const queues =
    options.queues
      ?.map((queue) => queue.trim())
      .filter(Boolean) ?? DEFAULT_QUEUES

  const limit = Math.max(1, Math.min(options.limit ?? 10, 50))
  const leaseSeconds = Math.max(
    30,
    Math.min(options.leaseSeconds ?? 120, 3600),
  )

  const client = createWorkerClient()
  const { data, error } = await client.rpc(
    'claim_background_jobs',
    {
      p_worker_id: workerId,
      p_queues: queues,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
  )

  if (error) {
    throw new Error(`Unable to claim jobs: ${error.message}`)
  }

  const jobs = parseJobs(data)
  const result: ProcessJobsResult = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    failed: 0,
    deadLettered: 0,
    jobs: [],
  }

  for (const job of jobs) {
    const handler = getJobHandler(job.job_type)

    if (!handler) {
      const failure = await client.rpc('fail_background_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: 'HANDLER_NOT_FOUND',
        p_error_message: `No handler is registered for ${job.job_type}.`,
        p_retryable: false,
      })

      if (failure.error) {
        throw new Error(
          `Unable to fail unhandled job ${job.id}: ${failure.error.message}`,
        )
      }

      result.failed += 1
      result.jobs.push({
        id: job.id,
        jobType: job.job_type,
        status: 'failed',
        error: 'No job handler is registered.',
      })
      continue
    }

    try {
      const handlerResult = await handler({
        workerId,
        job,
        heartbeat: async () => {
          const heartbeat = await client.rpc(
            'heartbeat_background_job',
            {
              p_job_id: job.id,
              p_worker_id: workerId,
              p_lease_seconds: leaseSeconds,
            },
          )

          if (heartbeat.error || heartbeat.data !== true) {
            throw new Error(
              heartbeat.error?.message ??
                'The job lease could not be renewed.',
            )
          }
        },
      })

      const completion = await client.rpc(
        'complete_background_job',
        {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_result: (handlerResult ?? null) as JsonValue | null,
        },
      )

      if (completion.error || completion.data !== true) {
        throw new Error(
          completion.error?.message ??
            'The completed job could not be persisted.',
        )
      }

      result.completed += 1
      result.jobs.push({
        id: job.id,
        jobType: job.job_type,
        status: 'completed',
      })
    } catch (jobError) {
      const details = getErrorDetails(jobError)
      const failure = await client.rpc('fail_background_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: details.code,
        p_error_message: details.message,
        p_retryable: details.retryable,
      })

      if (failure.error) {
        throw new Error(
          `Unable to record failure for job ${job.id}: ${failure.error.message}`,
        )
      }

      const failedJob = failure.data as BackgroundJob | null
      const status = failedJob?.status ?? 'failed'

      if (status === 'retrying') {
        result.retried += 1
      } else if (status === 'dead_letter') {
        result.deadLettered += 1
      } else {
        result.failed += 1
      }

      result.jobs.push({
        id: job.id,
        jobType: job.job_type,
        status,
        error: details.message,
      })
    }
  }

  return result
}
