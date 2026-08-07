import Link from 'next/link'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FileClock,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'

import {
  getPlatformAuditEvents,
  getPlatformAuditMetrics,
  type PlatformAuditCategory,
} from '@/lib/platform/audit'
import type { PlatformRole } from '@/lib/platform/types'

type SearchParams = Promise<{
  q?: string
  category?: string
  role?: string
  resource?: string
  days?: string
  page?: string
}>

function normalizeCategory(
  value: string | undefined,
): PlatformAuditCategory | 'all' {
  if (
    value === 'organization' ||
    value === 'subscription' ||
    value === 'billing' ||
    value === 'telephony' ||
    value === 'ai' ||
    value === 'support'
  ) {
    return value
  }
  return 'all'
}

function normalizeRole(
  value: string | undefined,
): PlatformRole | 'all' {
  if (
    value === 'platform_owner' ||
    value === 'platform_admin' ||
    value === 'finance' ||
    value === 'support' ||
    value === 'developer'
  ) {
    return value
  }
  return 'all'
}

function normalizeDays(value: string | undefined): 1 | 7 | 30 | 90 | 0 {
  if (value === '1') return 1
  if (value === '7') return 7
  if (value === '90') return 90
  if (value === '0') return 0
  return 30
}

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function actionClass(category: string): string {
  if (category === 'billing') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (category === 'support') {
    return 'border-violet-400/20 bg-violet-400/10 text-violet-200'
  }
  if (category === 'telephony') {
    return 'border-sky-400/20 bg-sky-400/10 text-sky-200'
  }
  if (category === 'ai') {
    return 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200'
  }
  if (category === 'organization') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
}

function pageHref(input: {
  q: string
  category: PlatformAuditCategory | 'all'
  role: PlatformRole | 'all'
  resource: string
  days: number
  page: number
}): string {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.category !== 'all') params.set('category', input.category)
  if (input.role !== 'all') params.set('role', input.role)
  if (input.resource) params.set('resource', input.resource)
  if (input.days !== 30) params.set('days', String(input.days))
  if (input.page > 1) params.set('page', String(input.page))
  const query = params.toString()
  return query ? `/platform/audit?${query}` : '/platform/audit'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const category = normalizeCategory(query.category)
  const role = normalizeRole(query.role)
  const resource = query.resource?.trim() ?? ''
  const days = normalizeDays(query.days)
  const requestedPage = normalizePage(query.page)
  const pageSize = 25
  const offset = (requestedPage - 1) * pageSize

  const [metrics, directory] = await Promise.all([
    getPlatformAuditMetrics(),
    getPlatformAuditEvents({
      search: q,
      category,
      actorRole: role,
      resourceType: resource,
      days,
      limit: pageSize,
      offset,
    }),
  ])

  const totalPages = Math.max(Math.ceil(directory.total / pageSize), 1)
  const page = Math.min(requestedPage, totalPages)

  const metricCards = [
    {
      label: 'Events / 24h',
      value: metrics.eventsLast24Hours,
      detail: `${metrics.eventsLast7Days} in the last 7 days`,
      icon: Activity,
    },
    {
      label: 'Active staff / 7d',
      value: metrics.activeActorsLast7Days,
      detail: 'Distinct platform actors',
      icon: Users,
    },
    {
      label: 'Organizations touched / 7d',
      value: metrics.organizationsTouchedLast7Days,
      detail: 'Distinct customer organizations',
      icon: ShieldCheck,
    },
    {
      label: 'Support sessions / 7d',
      value: metrics.supportSessionsLast7Days,
      detail: `${metrics.billingActionsLast7Days} billing actions`,
      icon: FileClock,
    },
    {
      label: 'Provider actions / 7d',
      value: metrics.providerActionsLast7Days,
      detail: 'Telephony and AI operations',
      icon: Activity,
    },
  ]

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Platform governance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Platform Audit Logs
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Immutable internal history for privileged Flowtix staff actions across
            organizations, subscriptions, PayMongo billing, telephony, AI providers,
            and support access.
          </p>
        </div>

        <Link
          href="/platform/security/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run security validation
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map(({ label, value, detail, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <Icon className="h-5 w-5 text-blue-300" />
            <p className="mt-4 text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {value.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <p className="text-sm leading-6 text-slate-400">
            Platform audit history is read-only. Authenticated platform staff can
            query it only through staff-guarded RPCs. Secret-like keys are
            recursively removed from before/after state and metadata before any
            audit JSON reaches the browser.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <form
          method="get"
          className="grid gap-3 xl:grid-cols-[1fr_170px_180px_170px_150px_auto]"
        >
          <label className="relative block">
            <span className="sr-only">Search platform audit logs</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Action, organization, actor, reason, resource ID"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <select
            name="category"
            defaultValue={category}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All categories</option>
            <option value="organization">Organization</option>
            <option value="subscription">Subscription</option>
            <option value="billing">Billing</option>
            <option value="telephony">Telephony</option>
            <option value="ai">AI</option>
            <option value="support">Support</option>
          </select>

          <select
            name="role"
            defaultValue={role}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All staff roles</option>
            <option value="platform_owner">Platform Owner</option>
            <option value="platform_admin">Platform Admin</option>
            <option value="finance">Finance</option>
            <option value="support">Support</option>
            <option value="developer">Developer</option>
          </select>

          <input
            name="resource"
            defaultValue={resource}
            placeholder="Resource type"
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
          />

          <select
            name="days"
            defaultValue={String(days)}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="0">All time</option>
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
            <FileClock className="mx-auto h-9 w-9 text-slate-600" />
            <h2 className="mt-4 font-semibold text-white">No audit events found</h2>
            <p className="mt-2 text-sm text-slate-500">
              Adjust the current filters or date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Action</th>
                  <th className="px-6 py-4 font-medium">Actor</th>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Resource</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((event) => (
                  <tr
                    key={event.id}
                    className="transition hover:bg-white/[0.025]"
                  >
                    <td className="px-6 py-5">
                      <Link
                        href={`/platform/audit/${event.id}`}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {event.action.replaceAll('_', ' ')}
                      </Link>
                      <div className="mt-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs capitalize ${actionClass(event.category)}`}
                        >
                          {event.category}
                        </span>
                      </div>
                      {event.reason ? (
                        <p className="mt-2 max-w-md truncate text-xs text-slate-500">
                          {event.reason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      <p className="capitalize text-slate-300">
                        {event.actorRole?.replaceAll('_', ' ') ?? 'Unknown role'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.actorEmail ?? event.actorUserId ?? 'Unknown actor'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      {event.organizationName ?? 'Platform-wide'}
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-slate-300">{event.resourceType}</p>
                      <p className="mt-1 max-w-xs truncate text-xs text-slate-600">
                        {event.resourceId ?? '—'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-5 text-slate-500">
                      {formatDate(event.createdAt)}
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
          Page {page} of {totalPages} · {directory.total.toLocaleString()} events
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={pageHref({
                q,
                category,
                role,
                resource,
                days,
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
                category,
                role,
                resource,
                days,
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
