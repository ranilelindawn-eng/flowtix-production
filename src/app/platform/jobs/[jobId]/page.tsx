import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Clock3,
  FileJson,
  History,
  ServerCog,
} from 'lucide-react'

import PlatformJobControls from '@/components/platform/PlatformJobControls'
import { requirePlatformPermission } from '@/lib/platform/auth'
import { getPlatformJob } from '@/lib/platform/jobs'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

function JsonPanel({
  title,
  value,
}: {
  title: string
  value: Record<string, unknown> | unknown[] | null
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <FileJson className="h-4 w-4 text-blue-300" />
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words p-5 text-xs leading-6 text-slate-300">
        {value
          ? JSON.stringify(value, null, 2)
          : 'No data recorded.'}
      </pre>
    </article>
  )
}

export default async function PlatformJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params

  const [job, membership] = await Promise.all([
    getPlatformJob(jobId),
    requirePlatformPermission('platform.jobs.view'),
  ])

  if (!job) notFound()

  const canManage =
    membership.role === 'platform_owner' ||
    membership.role === 'platform_admin' ||
    membership.role === 'developer'

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/jobs"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Background Jobs
        </Link>

        <div className="mt-5">
          <p className="text-sm font-medium text-blue-300">{job.queue}</p>
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-white">
            {job.jobType}
          </h1>
          <p className="mt-2 break-all text-sm text-slate-500">
            {job.id}
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <ServerCog className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Status</p>
          <p className="mt-1 capitalize text-white">
            {job.status.replaceAll('_', ' ')}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <History className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Attempts</p>
          <p className="mt-1 text-white">
            {job.attemptCount} / {job.maxAttempts}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Building2 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Organization</p>
          <p className="mt-1 text-white">
            {job.organizationName ?? 'Platform/system'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Clock3 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Last update</p>
          <p className="mt-1 text-sm text-white">{formatDate(job.updatedAt)}</p>
        </article>
      </section>

      {job.lastErrorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5">
          <p className="text-sm font-semibold text-red-200">
            {job.lastErrorCode ?? 'Background job failure'}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-100/80">
            {job.lastErrorMessage}
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Execution details</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Priority</dt>
              <dd className="mt-1 text-slate-200">{job.priority}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Partition key</dt>
              <dd className="mt-1 break-all text-slate-200">
                {job.partitionKey ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Scheduled</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(job.scheduledAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Next retry</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(job.nextRetryAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Started</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(job.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Completed</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(job.completedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Worker</dt>
              <dd className="mt-1 break-all text-slate-200">
                {job.lockedBy ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Heartbeat</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(job.heartbeatAt)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Idempotency key</dt>
              <dd className="mt-1 break-all text-slate-200">
                {job.idempotencyKey ?? '—'}
              </dd>
            </div>
          </dl>
        </article>

        {canManage ? (
          <PlatformJobControls
            jobId={job.id}
            status={job.status}
            stale={job.stale}
          />
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-slate-400">
              Your Platform role has read-only Background Jobs access.
            </p>
          </section>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <JsonPanel title="Sanitized payload" value={job.payload} />
        <JsonPanel title="Sanitized result" value={job.result} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Job event history</h2>
          <p className="mt-1 text-sm text-slate-500">
            Status transitions generated by the existing durable job event trigger.
          </p>
        </div>

        {job.events.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-500">
            No job events were recorded.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {job.events.map((event) => (
              <div key={event.id} className="px-6 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium capitalize text-slate-200">
                      {event.eventType.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.fromStatus ?? '—'} → {event.toStatus ?? '—'}
                    </p>
                    {event.message ? (
                      <p className="mt-2 text-sm text-slate-400">
                        {event.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {formatDate(event.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {event.workerId ?? 'No worker'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
