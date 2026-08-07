import Link from 'next/link'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
} from 'lucide-react'

import { requirePlatformPermission } from '@/lib/platform/auth'
import {
  getPlatformCustomers,
  type PlatformCustomerStatus,
} from '@/lib/platform/customers'

type SearchParams = Promise<{
  q?: string
  status?: string
  page?: string
}>

function normalizeStatus(value: string | undefined): PlatformCustomerStatus | 'all' {
  if (value === 'active' || value === 'suspended' || value === 'archived') {
    return value
  }
  return 'all'
}

function normalizePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)
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

function subscriptionClass(status: string | undefined): string {
  if (status === 'active' || status === 'trialing') {
    return 'text-emerald-300'
  }
  if (status === 'past_due') return 'text-amber-300'
  return 'text-slate-400'
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
  return query ? `/platform/customers?${query}` : '/platform/customers'
}

export default async function PlatformCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requirePlatformPermission('platform.customers.view')

  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const status = normalizeStatus(query.status)
  const requestedPage = normalizePage(query.page)
  const pageSize = 25
  const offset = (requestedPage - 1) * pageSize

  const directory = await getPlatformCustomers({
    search: q,
    status,
    limit: pageSize,
    offset,
  })

  const totalPages = Math.max(Math.ceil(directory.total / pageSize), 1)
  const page = Math.min(requestedPage, totalPages)

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Platform operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Staff-only customer directory across Flowtix organizations. Customer workspace roles do not grant access to this data.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
          <span className="font-semibold text-white">{directory.total}</span>{' '}
          organizations match the current filter
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <form className="grid gap-3 lg:grid-cols-[1fr_190px_auto]" method="get">
          <label className="relative block">
            <span className="sr-only">Search customers</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search organization, slug, owner name, or email"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/50"
            />
          </label>

          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
          >
            <option value="all">All organization statuses</option>
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
            <h2 className="mt-4 font-semibold text-white">No customers found</h2>
            <p className="mt-2 text-sm text-slate-500">
              Adjust the search or status filter and try again.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Owner</th>
                  <th className="px-6 py-4 font-medium">Workspace</th>
                  <th className="px-6 py-4 font-medium">Subscription</th>
                  <th className="px-6 py-4 font-medium">Current AI usage</th>
                  <th className="px-6 py-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((customer) => (
                  <tr key={customer.id} className="transition hover:bg-white/[0.025]">
                    <td className="px-6 py-5">
                      <Link
                        href={`/platform/customers/${customer.id}`}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {customer.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {customer.slug ?? customer.id}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-slate-200">
                        {customer.owner?.fullName ?? 'No named owner'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {customer.owner?.email ?? 'No owner email'}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(customer.status)}`}
                        >
                          {customer.status}
                        </span>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <Users className="h-3.5 w-3.5" />
                        {customer.memberCount} active member{customer.memberCount === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-medium text-slate-200">
                        {customer.subscription?.planName ?? 'No subscription'}
                      </p>
                      <p
                        className={`mt-1 text-xs capitalize ${subscriptionClass(customer.subscription?.status)}`}
                      >
                        {customer.subscription?.status?.replaceAll('_', ' ') ?? 'unconfigured'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-slate-300">
                      {customer.usage.aiRequests.toLocaleString()}
                    </td>
                    <td className="px-6 py-5 text-slate-400">
                      {formatDate(customer.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
