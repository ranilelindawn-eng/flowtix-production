import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ListRestart,
  LoaderCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react'

import {
  getBackgroundJobStats,
  listBackgroundJobs,
  listJobQueues,
} from '@/lib/jobs/admin'
import {
  JOB_STATUSES,
  type BackgroundJob,
  type JobStatus,
} from '@/lib/jobs/types'
import { requirePermission } from '@/lib/auth'

import {
  cancelBackgroundJob,
  retryBackgroundJob,
} from './actions'

import { getCurrentOrganizationTimezone } from '@/lib/team'
function isJobStatus(value: string | undefined): value is JobStatus {
  return JOB_STATUSES.includes(value as JobStatus)
}

function formatDate(value: string | null, timeZone: string) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getStatusClasses(status: JobStatus) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    case 'processing':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
    case 'retrying':
    case 'scheduled':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'failed':
    case 'dead_letter':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300'
    case 'cancelled':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300'
    default:
      return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
  }
}

function canCancel(job: BackgroundJob) {
  return ['queued', 'scheduled', 'retrying'].includes(
    job.status,
  )
}

function canRetry(job: BackgroundJob) {
  return ['failed', 'dead_letter', 'cancelled'].includes(job.status)
}

export default async function BackgroundJobsPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >
}) {
  const timeZone = await getCurrentOrganizationTimezone()
  const organization = await requirePermission('jobs.view')
  const params = await searchParams
  const rawStatus =
    typeof params.status === 'string' ? params.status : undefined
  const rawQueue =
    typeof params.queue === 'string' ? params.queue.trim() : ''
  const status = isJobStatus(rawStatus) ? rawStatus : undefined

  const [stats, jobs, queues] = await Promise.all([
    getBackgroundJobStats(organization.organization_id),
    listBackgroundJobs({
      organizationId: organization.organization_id,
      status,
      queue: rawQueue || undefined,
      limit: 100,
    }),
    listJobQueues(organization.organization_id),
  ])

  const activeCount =
    stats.queued +
    stats.scheduled +
    stats.processing +
    stats.retrying
  const attentionCount = stats.failed + stats.dead_letter

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-cyan-400">
          Platform operations
        </p>
        <h1 className="mt-1 text-3xl font-bold">Background Jobs</h1>
        <p className="mt-2 text-muted-foreground">
          Monitor durable work, retry failed jobs, and cancel queued
          operations for this organization.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Clock3 className="h-5 w-5" />
            <span className="text-sm font-medium">Active</span>
          </div>
          <p className="mt-3 text-3xl font-bold">{activeCount}</p>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <LoaderCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Processing</span>
          </div>
          <p className="mt-3 text-3xl font-bold">{stats.processing}</p>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Completed</span>
          </div>
          <p className="mt-3 text-3xl font-bold">{stats.completed}</p>
        </article>

        <article className="rounded-xl border border-rose-500/20 bg-card p-5">
          <div className="flex items-center gap-3 text-rose-300">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">Needs attention</span>
          </div>
          <p className="mt-3 text-3xl font-bold">{attentionCount}</p>
        </article>
      </section>

      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]">
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded-lg border border-border bg-background px-3 py-2"
        >
          <option value="">All statuses</option>
          {JOB_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item.replace('_', ' ')}
            </option>
          ))}
        </select>

        <select
          name="queue"
          defaultValue={rawQueue}
          className="rounded-lg border border-border bg-background px-3 py-2"
        >
          <option value="">All queues</option>
          {queues.map((queue) => (
            <option key={queue} value={queue}>
              {queue}
            </option>
          ))}
        </select>

        <button className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
          Apply filters
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Recent jobs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing up to 100 of the newest matching jobs.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-4">Job</th>
                <th className="p-4">Queue</th>
                <th className="p-4">Status</th>
                <th className="p-4">Attempts</th>
                <th className="p-4">Scheduled</th>
                <th className="p-4">Updated</th>
                <th className="p-4">Error</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-border align-top">
                  <td className="p-4">
                    <p className="font-medium">{job.job_type}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {job.id}
                    </p>
                  </td>
                  <td className="p-4 font-mono text-xs">{job.queue}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getStatusClasses(job.status)}`}
                    >
                      {job.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    {job.attempt_count}/{job.max_attempts}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {formatDate(job.next_retry_at ?? job.scheduled_at, timeZone)}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {formatDate(job.updated_at, timeZone)}
                  </td>
                  <td className="max-w-[280px] p-4">
                    {job.last_error_message ? (
                      <div>
                        <p className="line-clamp-2 text-rose-300">
                          {job.last_error_message}
                        </p>
                        {job.last_error_code ? (
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {job.last_error_code}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      {canRetry(job) ? (
                        <form action={retryBackgroundJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry
                          </button>
                        </form>
                      ) : null}

                      {canCancel(job) ? (
                        <form action={cancelBackgroundJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10">
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        </form>
                      ) : null}

                      {!canRetry(job) && !canCancel(job) ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                          <ListRestart className="h-3.5 w-3.5" />
                          No action
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {jobs.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">
            No background jobs match the selected filters.
          </p>
        ) : null}
      </section>
    </div>
  )
}
