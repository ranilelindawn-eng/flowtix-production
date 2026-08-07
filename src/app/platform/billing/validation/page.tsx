import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  RefreshCcw,
  ShieldCheck,
  Webhook,
} from 'lucide-react'

import { getPayMongoAcceptanceReport } from '@/lib/platform/billing-validation'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

export default async function PlatformBillingValidationPage() {
  const report = await getPayMongoAcceptanceReport()

  const cards = [
    {
      label: 'Active subscriptions',
      value: report.subscriptions.active,
      detail: `${report.subscriptions.pending} pending · ${report.subscriptions.pastDue} past due`,
      icon: ShieldCheck,
    },
    {
      label: 'Paid payments',
      value: report.payments.paid,
      detail: `${report.payments.failed} failed · ${report.payments.pending} pending`,
      icon: CircleDollarSign,
    },
    {
      label: 'Processed webhooks',
      value: report.webhooks.processed,
      detail: `${report.webhooks.failed} failed · ${report.webhooks.deadLettered} dead letter`,
      icon: Webhook,
    },
    {
      label: 'Invoices',
      value: report.invoices.total,
      detail: `${report.invoices.paid} paid · ${report.invoices.open} open`,
      icon: FileText,
    },
    {
      label: 'Lifecycle events',
      value: report.lifecycle.events,
      detail: `${report.lifecycle.recentEvents24Hours} in the last 24 hours`,
      icon: RefreshCcw,
    },
  ]

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/billing"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing & PayMongo
        </Link>

        <p className="mt-5 text-sm font-medium text-blue-300">
          Phase 2.4 acceptance validation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          PayMongo Lifecycle Validation
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Read-only consistency checks across subscriptions, checkout/payment
          ledgers, PayMongo webhook events, invoices, usage statements, and
          subscription lifecycle history.
        </p>
      </section>

      <section
        className={`rounded-2xl border p-6 ${
          report.healthy
            ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
            : 'border-amber-400/20 bg-amber-400/[0.06]'
        }`}
      >
        <div className="flex items-start gap-4">
          {report.healthy ? (
            <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-300" />
          ) : (
            <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-300" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">
              {report.healthy
                ? 'PayMongo ledgers are internally consistent'
                : 'Billing records need review'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Acceptance score: {report.score}/100 · Checked{' '}
              {formatDate(report.checkedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, detail, icon: Icon }) => (
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          [
            'Non-PayMongo subscriptions',
            report.subscriptions.nonPayMongo,
          ],
          [
            'Expired pending checkouts',
            report.subscriptions.expiredPendingCheckouts,
          ],
          [
            'Pending subscriptions without checkout',
            report.subscriptions.pendingWithoutCheckout,
          ],
          [
            'Paid payments missing invoices',
            report.payments.paidMissingInvoice,
          ],
          [
            'Invoice amount mismatches',
            report.payments.invoiceAmountMismatches,
          ],
          [
            'Paid webhooks missing payment ledger',
            report.webhooks.paidEventsWithoutPaymentLedger,
          ],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
          >
            <p className="text-sm text-slate-500">{String(label)}</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                Number(value) === 0 ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {Number(value).toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Acceptance findings</h2>
          <p className="mt-1 text-sm text-slate-500">
            These checks do not mutate payments, subscriptions, invoices, or
            PayMongo webhook events.
          </p>
        </div>

        {report.issues.length === 0 ? (
          <div className="px-6 py-10">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No lifecycle inconsistencies detected.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {report.issues.map((issue) => (
              <div key={issue.key} className="px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p
                      className={
                        issue.severity === 'critical'
                          ? 'font-semibold text-red-200'
                          : 'font-semibold text-amber-200'
                      }
                    >
                      {issue.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{issue.key}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {issue.count.toLocaleString()} affected
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <p className="text-sm leading-6 text-slate-400">
          A clean database acceptance report validates Flowtix&apos;s internal
          billing ledgers. Final end-to-end acceptance still requires one real
          PayMongo test checkout/webhook transaction so the external provider
          boundary is exercised as well.
        </p>
      </section>
    </div>
  )
}
