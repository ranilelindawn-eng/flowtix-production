import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  RefreshCcw,
  Search,
  WalletCards,
} from 'lucide-react'

import {
  getPlatformBillingEvents,
  getPlatformBillingInvoices,
  getPlatformBillingMetrics,
  getPlatformBillingPayments,
  getPlatformBillingReconciliations,
  getPlatformBillingUsage,
} from '@/lib/platform/billing'

type Tab = 'events' | 'payments' | 'invoices' | 'usage' | 'reconciliation'
type SearchParams = Promise<{
  tab?: string
  q?: string
  status?: string
  page?: string
}>

const tabs: { id: Tab; label: string }[] = [
  { id: 'events', label: 'Webhook events' },
  { id: 'payments', label: 'Payments' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'usage', label: 'Usage statements' },
  { id: 'reconciliation', label: 'Reconciliation' },
]

function normalizeTab(value: string | undefined): Tab {
  return tabs.some((tab) => tab.id === value) ? (value as Tab) : 'events'
}

function pageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function date(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function money(cents: number, currency = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function badge(status: string): string {
  if (['paid', 'processed', 'healthy', 'finalized', 'invoiced'].includes(status)) {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (['failed', 'uncollectible'].includes(status)) {
    return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
  if (['ignored', 'pending', 'open', 'received'].includes(status)) {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

function href(input: {
  tab: Tab
  q: string
  status: string
  page: number
}) {
  const params = new URLSearchParams()
  params.set('tab', input.tab)
  if (input.q) params.set('q', input.q)
  if (input.status && input.status !== 'all') params.set('status', input.status)
  if (input.page > 1) params.set('page', String(input.page))
  return `/platform/billing?${params.toString()}`
}

export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const query = await searchParams
  const tab = normalizeTab(query.tab)
  const q = query.q?.trim() ?? ''
  const status = query.status?.trim() || 'all'
  const page = pageNumber(query.page)
  const limit = 25
  const offset = (page - 1) * limit

  const metricsPromise = getPlatformBillingMetrics()
  const directoryPromise =
    tab === 'events'
      ? getPlatformBillingEvents({ search: q, status, limit, offset })
      : tab === 'payments'
        ? getPlatformBillingPayments({ search: q, status, limit, offset })
        : tab === 'invoices'
          ? getPlatformBillingInvoices({ search: q, status, limit, offset })
          : tab === 'usage'
            ? getPlatformBillingUsage({ search: q, status, limit, offset })
            : getPlatformBillingReconciliations({ search: q, status, limit, offset })

  const [metrics, directory] = await Promise.all([
    metricsPromise,
    directoryPromise,
  ])

  const totalPages = Math.max(Math.ceil(directory.total / limit), 1)

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Platform finance operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Billing & PayMongo
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Inspect Flowtix payment events, webhook delivery attempts, customer
            payments, invoices, usage billing, and reconciliation without
            bypassing the existing PayMongo lifecycle.
          </p>
        </div>

        <Link
          href="/platform/billing/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run lifecycle validation
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <WalletCards className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Revenue this month</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {money(metrics.revenueThisMonthCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.paidPaymentsThisMonth} paid payments
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <AlertTriangle className="h-5 w-5 text-red-300" />
          <p className="mt-4 text-sm text-slate-500">Failed payments</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {metrics.failedPayments}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.failedWebhookEvents} failed webhooks
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <FileText className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Open invoices</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {metrics.openInvoices}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {money(metrics.amountDueCents)} due
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <RefreshCcw className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Dead-lettered events</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {metrics.deadLetteredEvents}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.openUsageStatements} open usage statements
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <p className="text-sm leading-6 text-slate-400">
            PayMongo remains the sole active billing provider. This module reads
            the existing ledgers and uses the existing webhook processor for
            replay. It does not create fake payments, mark invoices paid
            manually, or directly activate unpaid subscriptions.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="flex flex-wrap gap-2 border-b border-white/10 p-4">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={href({ tab: item.id, q: '', status: 'all', page: 1 })}
              className={`rounded-xl px-4 py-2 text-sm transition ${
                tab === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="border-b border-white/10 p-5">
          <form method="get" className="grid gap-3 lg:grid-cols-[1fr_190px_auto]">
            <input type="hidden" name="tab" value={tab} />
            <label className="relative block">
              <span className="sr-only">Search billing data</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search organization, event, payment, invoice, or plan"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#050D18] pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
              />
            </label>
            <input
              name="status"
              defaultValue={status === 'all' ? '' : status}
              placeholder="Status (optional)"
              className="h-11 rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
            />
            <button
              type="submit"
              className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Apply filters
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          {tab === 'events' ? (
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Event</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Attempts</th><th className="px-6 py-4">Received</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(directory.items as Awaited<ReturnType<typeof getPlatformBillingEvents>>['items']).map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <Link href={`/platform/billing/events/${item.id}`} className="font-medium text-white hover:text-blue-300">
                        {item.eventType}
                      </Link>
                      <p className="mt-1 max-w-sm truncate text-xs text-slate-500">{item.providerEventId}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{item.organizationName ?? 'Unassigned'}</td>
                    <td className="px-6 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${badge(item.status)}`}>{item.status}</span></td>
                    <td className="px-6 py-4 text-slate-400">{item.processingAttempts}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{date(item.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tab === 'payments' ? (
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Payment</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Plan</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(directory.items as Awaited<ReturnType<typeof getPlatformBillingPayments>>['items']).map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4"><p className="font-medium text-white">{item.providerPaymentId ?? item.id}</p><p className="mt-1 max-w-xs truncate text-xs text-slate-500">{item.providerCheckoutId ?? 'No checkout reference'}</p></td>
                    <td className="px-6 py-4"><Link href={`/platform/customers/${item.organizationId}`} className="text-slate-300 hover:text-blue-300">{item.organizationName}</Link></td>
                    <td className="px-6 py-4 text-slate-400">{item.planCode ?? '—'}</td>
                    <td className="px-6 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${badge(item.status)}`}>{item.status}</span></td>
                    <td className="px-6 py-4 text-slate-200">{item.amountCents === null ? '—' : money(item.amountCents, item.currency)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{date(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tab === 'invoices' ? (
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Invoice</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Total</th><th className="px-6 py-4">Due</th><th className="px-6 py-4">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(directory.items as Awaited<ReturnType<typeof getPlatformBillingInvoices>>['items']).map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 font-medium text-white">{item.invoiceNumber}</td>
                    <td className="px-6 py-4"><Link href={`/platform/customers/${item.organizationId}`} className="text-slate-300 hover:text-blue-300">{item.organizationName}</Link></td>
                    <td className="px-6 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${badge(item.status)}`}>{item.status}</span></td>
                    <td className="px-6 py-4 text-slate-200">{money(item.totalCents, item.currency)}</td>
                    <td className="px-6 py-4 text-slate-400">{money(item.amountDueCents, item.currency)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{date(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tab === 'usage' ? (
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Period</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Subtotal</th><th className="px-6 py-4">Invoice</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(directory.items as Awaited<ReturnType<typeof getPlatformBillingUsage>>['items']).map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4"><Link href={`/platform/customers/${item.organizationId}`} className="text-slate-300 hover:text-blue-300">{item.organizationName}</Link></td>
                    <td className="px-6 py-4 text-slate-400">{item.periodStart} → {item.periodEnd}</td>
                    <td className="px-6 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${badge(item.status)}`}>{item.status}</span></td>
                    <td className="px-6 py-4 text-slate-200">{money(item.subtotalCents, item.currency)}</td>
                    <td className="px-6 py-4 text-slate-500">{item.invoiceId ?? 'Not invoiced'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Health</th><th className="px-6 py-4">Missing invoices</th><th className="px-6 py-4">Amount mismatches</th><th className="px-6 py-4">Expired pending</th><th className="px-6 py-4">Checked</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(directory.items as Awaited<ReturnType<typeof getPlatformBillingReconciliations>>['items']).map((item) => (
                  <tr key={item.organizationId}>
                    <td className="px-6 py-4"><Link href={`/platform/customers/${item.organizationId}`} className="font-medium text-white hover:text-blue-300">{item.organizationName}</Link><p className="mt-1 text-xs capitalize text-slate-500">{item.subscriptionStatus ?? 'no subscription'}</p></td>
                    <td className="px-6 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs ${badge(item.healthy ? 'healthy' : 'failed')}`}>{item.healthy ? 'Healthy' : 'Needs review'}</span></td>
                    <td className="px-6 py-4 text-slate-400">{item.missingInvoices}</td>
                    <td className="px-6 py-4 text-slate-400">{item.invoiceAmountMismatches}</td>
                    <td className="px-6 py-4 text-slate-400">{item.expiredPendingPayments}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{date(item.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {directory.items.length === 0 ? (
          <div className="border-t border-white/10 px-6 py-12 text-center text-sm text-slate-500">
            No billing records matched the current filters.
          </div>
        ) : null}
      </section>

      <section className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Page {Math.min(page, totalPages)} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={href({ tab, q, status, page: page - 1 })} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Previous</Link>
          ) : null}
          {page < totalPages ? (
            <Link href={href({ tab, q, status, page: page + 1 })} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Next</Link>
          ) : null}
        </div>
      </section>
    </div>
  )
}
