import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Clock3,
  FileJson,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { getPlatformAuditEvent } from '@/lib/platform/audit'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date)
}

function JsonPanel({
  title,
  value,
}: {
  title: string
  value: Record<string, unknown> | null
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <FileJson className="h-4 w-4 text-blue-300" />
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words p-5 text-xs leading-6 text-slate-300">
        {value && Object.keys(value).length > 0
          ? JSON.stringify(value, null, 2)
          : 'No data recorded.'}
      </pre>
    </article>
  )
}

export default async function PlatformAuditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const event = await getPlatformAuditEvent(eventId)

  if (!event) notFound()

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/audit"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to audit logs
        </Link>

        <div className="mt-5">
          <p className="text-sm font-medium capitalize text-blue-300">
            {event.category} audit event
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-white">
            {event.action.replaceAll('_', ' ')}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Event ID: {event.id}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <p className="text-sm leading-6 text-slate-400">
            This is an immutable platform audit record. State and metadata shown
            below have been passed through server-side recursive secret
            sanitization before being returned to this page.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <UserRound className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Actor</p>
          <p className="mt-1 capitalize text-white">
            {event.actorRole?.replaceAll('_', ' ') ?? 'Unknown role'}
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {event.actorEmail ?? event.actorUserId ?? 'Unknown actor'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Building2 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Organization</p>
          <p className="mt-1 text-white">
            {event.organizationName ?? 'Platform-wide'}
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {event.organizationId ?? '—'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <FileJson className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Resource</p>
          <p className="mt-1 text-white">{event.resourceType}</p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {event.resourceId ?? '—'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Clock3 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Recorded</p>
          <p className="mt-1 text-sm text-white">
            {formatDate(event.createdAt)}
          </p>
        </article>
      </section>

      {event.reason ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Action reason</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
            {event.reason}
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <JsonPanel title="Previous state" value={event.previousState} />
        <JsonPanel title="Resulting state" value={event.resultingState} />
      </section>

      <JsonPanel title="Metadata" value={event.metadata} />
    </div>
  )
}
