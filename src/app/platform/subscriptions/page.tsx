import Link from 'next/link'
import { ChevronLeft, ChevronRight, CreditCard, Search } from 'lucide-react'

import {
  getPlatformSubscriptionPlans,
  getPlatformSubscriptions,
} from '@/lib/platform/subscriptions'

type SearchParams = Promise<{ q?: string; status?: string; plan?: string; page?: string }>

function pageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function statusClass(status: string): string {
  if (status === 'active') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  if (status === 'trialing') return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
  if (status === 'past_due') return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  if (status === 'pending') return 'border-violet-400/20 bg-violet-400/10 text-violet-200'
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

function href(input: { q: string; status: string; plan: string; page: number }): string {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.status !== 'all') params.set('status', input.status)
  if (input.plan !== 'all') params.set('plan', input.plan)
  if (input.page > 1) params.set('page', String(input.page))
  const query = params.toString()
  return query ? `/platform/subscriptions?${query}` : '/platform/subscriptions'
}

export default async function PlatformSubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const status = query.status?.trim() || 'all'
  const plan = query.plan?.trim() || 'all'
  const requestedPage = pageNumber(query.page)
  const pageSize = 25
  const offset = (requestedPage - 1) * pageSize

  const [directory, plans] = await Promise.all([
    getPlatformSubscriptions({ search: q, status, planCode: plan, limit: pageSize, offset }),
    getPlatformSubscriptionPlans(),
  ])

  const totalPages = Math.max(Math.ceil(directory.total / pageSize), 1)
  const page = Math.min(requestedPage, totalPages)

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-blue-300">Revenue operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Subscription Management</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Review every customer subscription and manage controlled end-of-period plan or cancellation changes without bypassing the PayMongo payment lifecycle.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <form className="grid gap-3 xl:grid-cols-[1fr_180px_180px_auto]" method="get">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input name="q" defaultValue={q} placeholder="Search organization, owner email, or subscription ID" className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600" />
          </label>
          <select name="status" defaultValue={status} className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select name="plan" defaultValue={plan} className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white">
            <option value="all">All plans</option>
            {plans.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}
          </select>
          <button type="submit" className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500">Apply filters</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        {directory.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CreditCard className="mx-auto h-9 w-9 text-slate-600" />
            <h2 className="mt-4 font-semibold text-white">No subscriptions found</h2>
            <p className="mt-2 text-sm text-slate-500">Adjust the current search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Period end</th>
                  <th className="px-6 py-4 font-medium">Lifecycle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-white/[0.025]">
                    <td className="px-6 py-5">
                      <Link href={`/platform/subscriptions/${subscription.id}`} className="font-semibold text-white hover:text-blue-300">{subscription.organizationName}</Link>
                      <p className="mt-1 text-xs text-slate-500">{subscription.ownerEmail ?? subscription.organizationId}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-slate-200">{subscription.planName}</p>
                      <p className="mt-1 text-xs text-slate-500">₱{(subscription.monthlyPriceCents / 100).toLocaleString('en-PH')}/month</p>
                    </td>
                    <td className="px-6 py-5"><span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(subscription.status)}`}>{subscription.status.replaceAll('_', ' ')}</span></td>
                    <td className="px-6 py-5 text-slate-400">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US') : '—'}</td>
                    <td className="px-6 py-5 text-xs text-slate-400">
                      {subscription.cancelAtPeriodEnd ? <p className="text-amber-300">Cancellation scheduled</p> : null}
                      {subscription.scheduledPlanCode ? <p className="text-blue-300">→ {subscription.scheduledPlanCode}</p> : null}
                      {!subscription.cancelAtPeriodEnd && !subscription.scheduledPlanCode ? 'Current' : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          {page > 1 ? <Link href={href({ q, status, plan, page: page - 1 })} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300"><ChevronLeft className="h-4 w-4" /> Previous</Link> : null}
          {page < totalPages ? <Link href={href({ q, status, plan, page: page + 1 })} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Next <ChevronRight className="h-4 w-4" /></Link> : null}
        </div>
      </section>
    </div>
  )
}
