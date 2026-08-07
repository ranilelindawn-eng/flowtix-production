import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  RefreshCcw,
  Webhook,
} from 'lucide-react'

import PlatformBillingReplayControls from '@/components/platform/PlatformBillingReplayControls'
import { getPlatformBillingEvent } from '@/lib/platform/billing'

function date(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function badge(status: string): string {
  if (status === 'processed') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/20 bg-red-400/10 text-red-200'
  return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
}

export default async function PlatformBillingEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const event = await getPlatformBillingEvent(eventId)
  if (!event) notFound()

  return (
    <div className="space-y-8">
      <section>
        <Link href="/platform/billing?tab=events" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Billing & PayMongo
        </Link>
        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-300">PayMongo webhook event</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{event.eventType}</h1>
            <p className="mt-2 break-all text-sm text-slate-500">{event.providerEventId}</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium capitalize ${badge(event.status)}`}>
            {event.status}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Webhook className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Attempts</p>
          <p className="mt-1 text-2xl font-semibold text-white">{event.processingAttempts}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Clock3 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Received</p>
          <p className="mt-1 text-sm font-semibold text-white">{date(event.receivedAt)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <CheckCircle2 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Processed</p>
          <p className="mt-1 text-sm font-semibold text-white">{date(event.processedAt)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <RefreshCcw className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Last replay</p>
          <p className="mt-1 text-sm font-semibold text-white">{date(event.replayedAt)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Event diagnostics</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Customer</dt><dd className="mt-1 text-slate-200">{event.organizationName ?? 'Unassigned'}</dd></div>
            <div><dt className="text-slate-500">Plan code</dt><dd className="mt-1 text-slate-200">{event.planCode ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Checkout ID</dt><dd className="mt-1 break-all text-slate-200">{event.checkoutId ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Payment ID</dt><dd className="mt-1 break-all text-slate-200">{event.paymentId ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Resource</dt><dd className="mt-1 text-slate-200">{event.resourceType ?? '—'} {event.resourceId ? `· ${event.resourceId}` : ''}</dd></div>
            <div><dt className="text-slate-500">Livemode</dt><dd className="mt-1 text-slate-200">{event.livemode === null ? '—' : event.livemode ? 'Yes' : 'No'}</dd></div>
            <div><dt className="text-slate-500">Next retry</dt><dd className="mt-1 text-slate-200">{date(event.nextRetryAt)}</dd></div>
            <div><dt className="text-slate-500">Dead-lettered</dt><dd className="mt-1 text-slate-200">{date(event.deadLetteredAt)}</dd></div>
          </dl>

          {event.ignoredReason || event.errorMessage ? (
            <div className="mt-6 rounded-xl border border-red-400/15 bg-red-400/[0.04] p-4 text-sm">
              {event.ignoredReason ? <p className="text-amber-200">Ignored reason: {event.ignoredReason}</p> : null}
              {event.errorMessage ? <p className="mt-2 text-red-200">Error: {event.errorMessage}</p> : null}
            </div>
          ) : null}
        </article>

        <PlatformBillingReplayControls eventId={event.id} status={event.status} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Webhook delivery attempts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Append-only execution history captured by the existing resilient webhook engine.
          </p>
        </div>
        {event.attempts.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-500">No delivery attempts recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Attempt</th><th className="px-6 py-4">Outcome</th><th className="px-6 py-4">Duration</th><th className="px-6 py-4">Error</th><th className="px-6 py-4">Time</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {event.attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-6 py-4 text-slate-300">#{attempt.attemptNumber}</td>
                    <td className="px-6 py-4 capitalize text-slate-300">{attempt.outcome}</td>
                    <td className="px-6 py-4 text-slate-500">{attempt.durationMs === null ? '—' : `${attempt.durationMs} ms`}</td>
                    <td className="max-w-lg px-6 py-4 text-slate-400">{attempt.errorMessage ?? '—'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{date(attempt.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
