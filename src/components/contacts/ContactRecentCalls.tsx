import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  Phone,
} from 'lucide-react'

import type { ContactCall } from '@/lib/contact-calls'
import { formatCallDurationLabel } from '@/lib/formatters'

type ContactRecentCallsProps = {
  calls: ContactCall[]
}

function formatCallDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getDirectionLabel(direction: string): string {
  return direction.trim().toLowerCase() === 'inbound'
    ? 'Inbound'
    : 'Outbound'
}

function getStatusClasses(status: string): string {
  const normalizedStatus = status.trim().toLowerCase()

  if (
    normalizedStatus === 'completed' ||
    normalizedStatus === 'connected'
  ) {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  }

  if (
    normalizedStatus === 'failed' ||
    normalizedStatus === 'missed'
  ) {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  }

  return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
}

export default function ContactRecentCalls({
  calls,
}: ContactRecentCallsProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Recent Calls
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Call history associated with this contact.
          </p>
        </div>

        <Link
          href="/dashboard/calls"
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
        >
          View all calls
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {calls.length === 0 ? (
        <div className="p-6">
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
              <Phone className="h-5 w-5" />
            </div>

            <h3 className="mt-4 font-medium text-white">
              No calls recorded yet
            </h3>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Calls linked to this contact will appear here automatically.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          {calls.slice(0, 6).map((call) => {
            const inbound =
              call.direction.trim().toLowerCase() ===
              'inbound'

            return (
              <div
                key={call.id}
                className="flex flex-col gap-4 px-6 py-5 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300">
                    {inbound ? (
                      <ArrowDownLeft className="h-5 w-5" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">
                        {getDirectionLabel(call.direction)} call
                      </p>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${getStatusClasses(
                          call.status,
                        )}`}
                      >
                        {call.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{formatCallDate(call.started_at)}</span>

                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatCallDurationLabel(
                          call.duration_seconds,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}