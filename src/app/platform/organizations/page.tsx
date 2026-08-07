import Link from 'next/link'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'

import {
  getPlatformOrganizations,
} from '@/lib/platform/organizations'
import type { PlatformCustomerStatus } from '@/lib/platform/customers'

type SearchParams = Promise<{
  q?: string
  status?: string
  page?: string
}>

function normalizeStatus(
  value: string | undefined,
): PlatformCustomerStatus | 'all' {
  if (value === 'active' || value === 'suspended' || value === 'archived') {
    return value
  }
  return 'all'
}

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function statusClass(status: string): string {
  if (status === 'active') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (status === 'suspended') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

function pageHref(input: {
  q: string
  status: PlatformCustomerStatus | 'all'
  page: number
}): string {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.status !== 'all') params.set('status', input.status)
  if (input.page > 1) params.set('page', String(input.page))
  const query = params.toString()
  return query ? `/platform/organizations?${query}` : '/platform/organizations'
}

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const status = normalizeStatus(query.status)
  const requestedPage = normalizePage(query.page)
  const pageSize = 25
  const offset = (requestedPage - 1) * pageSize

  const directory = await getPlatformOrganizations({
    search: q,
    status,
    limit: pageSize,
    offset,
  })

  const totalPages = Math.max(Math.ceil(directory.total / pageSize), 1)
  const page = Math.min(requestedPage, totalPages)

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-blue-300">Platform operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Organization Management
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Manage customer workspace lifecycle independently from customer
          subscriptions. Suspension blocks workspace access without rewriting
          PayMongo billing state.
        </p>
      </section>

      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold text-amber-100">Lifecycle controls are privileged</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Only Flowtix Platform Owner and Platform Admin roles can use this module.
              Every status change requires a reason and creates a platform audit record.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <form className="grid gap-3 lg:grid-cols-[1fr_190px_auto]" method="get">
          <label className="relative block">
            <span className="sr-only">Search organizations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search organization, slug, owner name, or email"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>

          <button
            type="submit"
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Apply filters
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        {directory.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Building2 className="mx-auto h-9 w-9 text-slate-600" />
            <h2 className="mt-4 font-semibold text-white">No organizations found</h2>
            <p className="mt-2 text-sm text-slate-500">
              Adjust the current search or lifecycle filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Owner</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Members</th>
                  <th className="px-6 py-4 font-medium">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((organization) => (
                  <tr
                    key={organization.id}
                    className="transition hover:bg-white/[0.025]"
                  >
                    <td className="px-6 py-5">
                      <Link
                        href={`/platform/organizations/${organization.id}`}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {organization.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {organization.slug ?? organization.id}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-slate-200">
                        {organization.owner?.fullName ?? 'No named owner'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {organization.owner?.email ?? 'No owner email'}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(organization.status)}`}
                      >
                        {organization.status}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="flex items-center gap-2 text-slate-300">
                        <Users className="h-4 w-4 text-slate-500" />
                        {organization.memberCount}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-slate-200">
                        {organization.subscription?.planName ?? 'No subscription'}
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {organization.subscription?.status?.replaceAll('_', ' ') ?? 'unconfigured'}
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
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={pageHref({ q, status, page: page - 1 })}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={pageHref({ q, status, page: page + 1 })}
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
