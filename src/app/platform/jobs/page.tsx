import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Search,
  ServerCog,
} from 'lucide-react'

import {
  getPlatformJobMetrics,
  getPlatformJobs,
} from '@/lib/platform/jobs'
import type { JobStatus } from '@/lib/jobs/types'

type SearchParams = Promise<{
  q?: string
  status?: string
  queue?: string
  type?: string
  page?: string
}>

function normalizeStatus(
  value: string | undefined,
): JobStatus | 'all' {
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
  return 'all'
}

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function statusClass(status: JobStatus): string {
  if (status === 'completed') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (status === 'failed' || status === 'dead_letter') {
    return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
  if (status === 'processing') {
    return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
  }
  if (status === 'retrying') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function pageHref(input: {
  q: string
  status: JobStatus | 'all'
  queue: string
  type: string
  page: number
}): string {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.status !== 'all') params.set('status', input.status)
  if (input.queue) params.set('queue', input.queue)
  if (input.type) params.set('type', input.type)
  if (input.page > 1) params.set('page', String(input.page))
  const query = params.toString()
  return query ? `/platform/jobs?${query}` : '/platform/jobs'
}

export default async function PlatformJobsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const status = normalizeStatus(query.status)
  const queue = query.queue?.trim() ?? ''
  const type = query.type?.trim() ?? ''
  const requestedPage = normalizePage(query.page)
  const pageSize = 25
  const offset = (requestedPage - 1) * pageSize

  const [metrics, directory] = await Promise.all([
    getPlatformJobMetrics(),
    getPlatformJobs({
      search: q,
      status,
      queue,
      jobType: type,
      limit: pageSize,
      offset,
    }),
  ])

  const totalPages = Math.max(Math.ceil(directory.total / pageSize), 1)
  const page = Math.min(requestedPage, totalPages)

  const metricCards = [
    {
      label: 'Ready',
      value: metrics.queued + metrics.scheduled + metrics.retrying,
      detail: `${metrics.queues} active queues`,
      icon: ListChecks,
      href: '/platform/jobs?status=queued',
    },
    {
      label: 'Processing',
      value: metrics.processing,
      detail: `${metrics.staleProcessing} stale leases`,
      icon: ServerCog,
      href: '/platform/jobs?status=processing',
    },
    {
      label: 'Completed / 24h',
      value: metrics.completedLast24Hours,
      detail: 'Durable jobs completed',
      icon: CheckCircle2,
      href: '/platform/jobs?status=completed',
    },
    {
      label: 'Failed / 24h',
      value: metrics.failedLast24Hours,
      detail: `${metrics.cancelledLast24Hours} cancelled`,
      icon: AlertTriangle,
      href: '/platform/jobs?status=failed',
    },
    {
      label: 'Dead letter',
      value: metrics.deadLetter,
      detail: 'Requires operator review',
      icon: AlertTriangle,
      href: '/platform/jobs?status=dead_letter',
    },
  ]

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">
            Platform operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Background Jobs
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Platform-wide visibility and controlled recovery for the existing
            Flowtix durable background job engine.
          </p>
        </div>

        <Link
          href="/platform/operations/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run operations validation
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map(({ label, value, detail, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:-translate-y-0.5 hover:border-blue-400/30 hover:bg-blue-400/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <Icon className="h-5 w-5 text-blue-300 transition group-hover:text-blue-200" />
            <p className="mt-4 text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {value.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-slate-500">{detail}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <form
          method="get"
          className="grid gap-3 xl:grid-cols-[1fr_180px_180px_220px_auto]"
        >
          <label className="relative block">
            <span className="sr-only">Search background jobs</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Job ID, organization, queue, type, or error"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="scheduled">Scheduled</option>
            <option value="processing">Processing</option>
            <option value="retrying">Retrying</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="dead_letter">Dead letter</option>
          </select>

          <select
            name="queue"
            defaultValue={queue}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="">All queues</option>
            {directory.queues.map((queueName) => (
              <option key={queueName} value={queueName}>
                {queueName}
              </option>
            ))}
          </select>

          <select
            name="type"
            defaultValue={type}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="">All job types</option>
            {directory.jobTypes.map((jobType) => (
              <option key={jobType} value={jobType}>
                {jobType}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Apply
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        {directory.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ListChecks className="mx-auto h-9 w-9 text-slate-600" />
            <h2 className="mt-4 font-semibold text-white">
              No background jobs found
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Adjust the queue, job type, status, or search filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Job</th>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Attempts</th>
                  <th className="px-6 py-4 font-medium">Schedule / worker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((job) => (
                  <tr
                    key={job.id}
                    className="transition hover:bg-white/[0.025]"
                  >
                    <td className="px-6 py-5">
                      <Link
                        href={`/platform/jobs/${job.id}`}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {job.jobType}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {job.queue} · {job.id}
                      </p>
                      {job.lastErrorMessage ? (
                        <p className="mt-2 max-w-md truncate text-xs text-red-300">
                          {job.lastErrorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      {job.organizationName ?? 'Platform/system'}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(job.status)}`}
                      >
                        {job.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      {job.attemptCount} / {job.maxAttempts}
                    </td>
                    <td className="px-6 py-5">
                      <p className="flex items-center gap-2 text-slate-400">
                        <Clock3 className="h-4 w-4 text-slate-600" />
                        {formatDate(job.nextRetryAt ?? job.scheduledAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {job.lockedBy ?? 'No active worker'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Page {page} of {totalPages} · {directory.total.toLocaleString()} jobs
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={pageHref({
                q,
                status,
                queue,
                type,
                page: page - 1,
              })}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={pageHref({
                q,
                status,
                queue,
                type,
                page: page + 1,
              })}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  )
}
