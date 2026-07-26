import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  getCall,
  type CallDirection,
  type CallStatus,
} from '@/lib/calls'

type CallPageProps = {
  params: Promise<{
    id: string
  }>
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

function getStatusClasses(status: CallStatus): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'failed':
      return 'border-red-500/20 bg-red-500/10 text-red-400'

    case 'scheduled':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-400'

    case 'cancelled':
    default:
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

function getDirectionClasses(
  direction: CallDirection,
): string {
  return direction === 'inbound'
    ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
    : 'border-violet-500/20 bg-violet-500/10 text-violet-400'
}

function getMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const value = metadata[key]

  return typeof value === 'string' ? value.trim() : ''
}

function formatMetadata(
  metadata: Record<string, unknown>,
): string {
  if (Object.keys(metadata).length === 0) {
    return 'No metadata is available for this call.'
  }

  return JSON.stringify(metadata, null, 2)
}

export default async function CallPage({
  params,
}: CallPageProps) {
  const { id } = await params
  const call = await getCall(id)

  if (!call) {
    notFound()
  }

  const phoneNumber = getMetadataString(
    call.metadata,
    'phone_number',
  )

  const source =
    getMetadataString(call.metadata, 'source') || 'Manual record'

  const callAgainHref = call.contact_id
    ? `/dashboard/dialer?contactId=${encodeURIComponent(
        call.contact_id,
      )}`
    : phoneNumber
      ? `/dashboard/dialer?phone=${encodeURIComponent(
          phoneNumber,
        )}`
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">
            Call details
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {call.direction === 'inbound'
              ? 'Inbound call'
              : 'Outbound call'}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review the call status, timing, contact,
            recording availability, and notes.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/dashboard/calls"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
          >
            Back to calls
          </Link>

          {callAgainHref ? (
            <Link
              href={callAgainHref}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Call again
            </Link>
          ) : null}

          <Link
            href={`/dashboard/calls/${id}/edit`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Edit call
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Call information
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Core details for this call record.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getDirectionClasses(
                  call.direction,
                )}`}
              >
                {call.direction}
              </span>

              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                  call.status,
                )}`}
              >
                {call.status}
              </span>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="space-y-6 p-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Phone number
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {phoneNumber || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Direction
              </dt>

              <dd className="mt-2 text-base capitalize text-slate-200">
                {call.direction}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </dt>

              <dd className="mt-2 text-base capitalize text-slate-200">
                {call.status}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Started
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDateTime(call.started_at)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Duration
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDuration(call.duration_seconds)}
              </dd>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recording
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {call.recording_available
                  ? 'Available'
                  : 'Not available'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Source
              </dt>

              <dd className="mt-2 capitalize text-slate-200">
                {source}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Contact
              </dt>

              <dd className="mt-2">
                {call.contact_id ? (
                  <Link
                    href={`/dashboard/contacts/${call.contact_id}`}
                    className="break-all text-base font-medium text-blue-400 transition hover:text-blue-300"
                  >
                    View contact
                  </Link>
                ) : (
                  <span className="text-base text-slate-200">
                    —
                  </span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Campaign
              </dt>

              <dd className="mt-2">
                {call.campaign_id ? (
                  <Link
                    href={`/dashboard/campaigns/${call.campaign_id}`}
                    className="break-all text-base font-medium text-blue-400 transition hover:text-blue-300"
                  >
                    View campaign
                  </Link>
                ) : (
                  <span className="text-base text-slate-200">
                    —
                  </span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Last updated
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDateTime(call.updated_at)}
              </dd>
            </div>
          </div>
        </dl>

        <div className="border-t border-white/10 p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Notes
          </h3>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
            {call.notes ||
              'No notes were added for this call.'}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">
            Call metadata
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Technical information stored with this call record.
          </p>
        </div>

        <div className="p-6">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-300">
            {formatMetadata(call.metadata)}
          </pre>
        </div>
      </section>
    </div>
  )
}