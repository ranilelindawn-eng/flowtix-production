import Link from 'next/link'

import { requirePermission } from '@/lib/auth'
import {
  getCalls,
  type Call,
  type CallDirection,
  type CallStatus,
} from '@/lib/calls'

import { getCurrentOrganizationTimezone } from '@/lib/team'
function formatDateTime(value: string, timeZone: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
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

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) {
    return `${remainingSeconds}s`
  }

  return `${minutes}m ${remainingSeconds}s`
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

function getDirectionClasses(direction: CallDirection): string {
  return direction === 'inbound'
    ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
    : 'border-violet-500/20 bg-violet-500/10 text-violet-400'
}

function getCallPhoneNumber(call: Call): string | null {
  const value = call.metadata?.phone_number

  if (typeof value !== 'string') {
    return null
  }

  const normalizedPhoneNumber = value.trim()

  return normalizedPhoneNumber || null
}

function getCallAgainHref(call: Call): string | null {
  if (call.contact_id) {
    return `/dashboard/dialer?contactId=${encodeURIComponent(
      call.contact_id,
    )}`
  }

  const phoneNumber = getCallPhoneNumber(call)

  if (!phoneNumber) {
    return null
  }

  return `/dashboard/dialer?phone=${encodeURIComponent(
    phoneNumber,
  )}`
}

export default async function CallsPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  await requirePermission('calls.view')

  const { calls, count } = await getCalls({
    page: 1,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-400">
            Activity
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
            Calls
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Review scheduled, completed, failed, and
            cancelled call records.
          </p>
        </div>

        <Link
          href="/dashboard/calls/new"
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          New Call
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-semibold text-white">
              All calls
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {count === 1 ? '1 call' : `${count} calls`}
            </p>
          </div>
        </div>

        {calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-xl text-blue-400">
              +
            </div>

            <h2 className="mt-4 text-lg font-semibold text-white">
              No calls yet
            </h2>

            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              Create your first call record to track
              activity, outcomes, and follow-up notes.
            </p>

            <Link
              href="/dashboard/calls/new"
              className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Create first call
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] text-left">
                <thead className="border-b border-white/10 bg-white/[0.02]">
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Direction
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Status
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Phone
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Started
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Duration
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Recording
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Notes
                    </th>

                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {calls.map((call) => {
                    const phoneNumber =
                      getCallPhoneNumber(call)

                    const callAgainHref =
                      call.status === 'completed' &&
                      call.direction === 'outbound'
                        ? getCallAgainHref(call)
                        : null

                    return (
                      <tr
                        key={call.id}
                        className="transition hover:bg-white/[0.03]"
                      >
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getDirectionClasses(
                              call.direction,
                            )}`}
                          >
                            {call.direction}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                              call.status,
                            )}`}
                          >
                            {call.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {phoneNumber || '—'}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {formatDateTime(call.started_at, timeZone)}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {formatDuration(
                            call.duration_seconds,
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-300">
                          {call.recording_available
                            ? 'Available'
                            : 'None'}
                        </td>

                        <td className="px-5 py-4">
                          <div className="max-w-xs truncate text-sm text-slate-400">
                            {call.notes || '—'}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`/dashboard/calls/${call.id}`}
                              className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
                            >
                              View
                            </Link>

                            {callAgainHref ? (
                              <Link
                                href={callAgainHref}
                                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:border-emerald-400/30 hover:bg-emerald-500/20 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                              >
                                Call Again
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-white/10 md:hidden">
              {calls.map((call) => {
                const phoneNumber =
                  getCallPhoneNumber(call)

                const callAgainHref =
                  call.status === 'completed' &&
                  call.direction === 'outbound'
                    ? getCallAgainHref(call)
                    : null

                return (
                  <article
                    key={call.id}
                    className="p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {formatDateTime(call.started_at, timeZone)}
                        </p>

                        <p className="mt-1 truncate text-sm text-slate-400">
                          {phoneNumber || 'No phone number'}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {formatDuration(
                            call.duration_seconds,
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                            call.status,
                          )}`}
                        >
                          {call.status}
                        </span>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getDirectionClasses(
                            call.direction,
                          )}`}
                        >
                          {call.direction}
                        </span>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-slate-500">
                          Recording
                        </dt>

                        <dd className="mt-1 text-slate-200">
                          {call.recording_available
                            ? 'Available'
                            : 'None'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500">
                          Notes
                        </dt>

                        <dd className="mt-1 line-clamp-2 text-slate-200">
                          {call.notes || '—'}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/dashboard/calls/${call.id}`}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-blue-400 transition hover:bg-white/[0.08] hover:text-blue-300"
                      >
                        View call
                      </Link>

                      {callAgainHref ? (
                        <Link
                          href={callAgainHref}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:border-emerald-400/30 hover:bg-emerald-500/20 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                          Call Again
                        </Link>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}