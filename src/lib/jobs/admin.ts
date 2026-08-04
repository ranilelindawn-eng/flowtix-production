import { createClient } from '@/lib/supabase/server'
import type { BackgroundJob, JobStatus } from '@/lib/jobs/types'

export type JobStats = Record<JobStatus, number>

export type JobListFilters = {
  organizationId: string
  status?: JobStatus
  queue?: string
  limit?: number
}

const emptyStats: JobStats = {
  queued: 0,
  scheduled: 0,
  processing: 0,
  retrying: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  dead_letter: 0,
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

export async function getBackgroundJobStats(
  organizationId: string,
): Promise<JobStats> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'get_background_job_stats',
    { p_organization_id: organizationId },
  )

  if (error) {
    throw new Error(`Unable to load job statistics: ${error.message}`)
  }

  const stats = { ...emptyStats }

  if (Array.isArray(data)) {
    for (const row of data) {
      if (
        row &&
        typeof row === 'object' &&
        typeof row.status === 'string' &&
        row.status in stats
      ) {
        const value = Number(row.job_count)
        stats[row.status as JobStatus] = Number.isFinite(value)
          ? value
          : 0
      }
    }
  }

  return stats
}

export async function listBackgroundJobs(
  filters: JobListFilters,
): Promise<BackgroundJob[]> {
  const supabase = await createClient()
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 200))

  let query = supabase
    .from('background_jobs')
    .select('*')
    .eq('organization_id', filters.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.queue?.trim()) {
    query = query.eq('queue', filters.queue.trim())
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Unable to load background jobs: ${error.message}`)
  }

  return parseJobs(data)
}

export async function listJobQueues(
  organizationId: string,
): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('background_jobs')
    .select('queue')
    .eq('organization_id', organizationId)
    .order('queue', { ascending: true })
    .limit(500)

  if (error) {
    throw new Error(`Unable to load job queues: ${error.message}`)
  }

  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.queue)
        .filter(
          (queue): queue is string =>
            typeof queue === 'string' && queue.length > 0,
        ),
    ),
  )
}
