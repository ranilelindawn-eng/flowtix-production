import Link from 'next/link'
import { Building2, CreditCard, Gem, Plus, Search } from 'lucide-react'

import { createEnterpriseAccount } from '@/app/platform/enterprise/actions'
import {
  getPlatformEnterpriseAccounts,
  type EnterpriseOnboardingStatus,
} from '@/lib/platform/enterprise'

const STATUS_OPTIONS: Array<{ value: EnterpriseOnboardingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'payment_confirmed', label: 'Payment confirmed' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'closed', label: 'Closed' },
]

function money(value: number | null) {
  return value === null
    ? 'Not proposed'
    : `₱${(value / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}/mo`
}

function statusClass(value: string) {
  if (value === 'active' || value === 'payment_confirmed') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (value === 'suspended' || value === 'closed') {
    return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
  if (value === 'awaiting_payment' || value === 'proposal') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
}

export default async function PlatformEnterprisePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  const params = await searchParams
  const search = params.search?.trim() ?? ''
  const requestedStatus = params.status ?? 'all'
  const status = STATUS_OPTIONS.some((option) => option.value === requestedStatus)
    ? (requestedStatus as EnterpriseOnboardingStatus | 'all')
    : 'all'

  const directory = await getPlatformEnterpriseAccounts({
    search,
    status,
    limit: 50,
  })

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-violet-500/15 p-3 text-violet-300">
            <Gem className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-violet-300">Assisted onboarding</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">Enterprise Accounts</h1>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
          Manage Enterprise inquiries, negotiated PHP pricing, custom workspace limits,
          PayMongo payment verification, onboarding, activation, suspension, and later limit changes.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <form method="get" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                name="search"
                defaultValue={search}
                placeholder="Search company, contact, email, or organization"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
              />
            </label>
            <select
              name="status"
              defaultValue={status}
              className="min-h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none focus:border-blue-400/50"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500">
              Filter
            </button>
          </div>
        </form>

        <form action={createEnterpriseAccount} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-blue-300" />
            <h2 className="font-semibold text-white">Add Enterprise customer</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Use this for an off-platform inquiry. Public Enterprise contact submissions appear automatically.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input name="contactName" required minLength={2} placeholder="Contact name" className="rounded-xl border border-white/10 bg-[#050D18] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" />
            <input name="contactEmail" required type="email" placeholder="Email" className="rounded-xl border border-white/10 bg-[#050D18] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" />
            <input name="companyName" placeholder="Company" className="rounded-xl border border-white/10 bg-[#050D18] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" />
          </div>
          <button className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 text-sm font-semibold text-blue-200 hover:bg-blue-500/15">
            <Plus className="h-4 w-4" /> Create record
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="font-semibold text-white">Enterprise pipeline</h2>
            <p className="mt-1 text-sm text-slate-500">{directory.total} record{directory.total === 1 ? '' : 's'}</p>
          </div>
        </div>

        {directory.items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No Enterprise inquiries or customers match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Onboarding</th>
                  <th className="px-6 py-4 font-medium">Price</th>
                  <th className="px-6 py-4 font-medium">Payment</th>
                  <th className="px-6 py-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {directory.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-200">{item.companyName ?? item.contactName}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.contactName} · {item.contactEmail}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-600" />
                        {item.organizationName ?? 'Not linked yet'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(item.onboardingStatus)}`}>
                        {item.onboardingStatus.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{money(item.proposedMonthlyPriceCents)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(item.paymentStatus === 'paid' ? 'active' : item.paymentStatus)}`}>
                        <CreditCard className="h-3 w-3" />
                        {item.paymentStatus.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/platform/enterprise/${item.id}`}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        Manage
                      </Link>
                    </td>
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
