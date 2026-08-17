import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ShieldCheck,
} from 'lucide-react'

import { getPlanAcceptanceReport } from '@/lib/platform/plan-validation'
import {
  convertUsdCentsToPhpCentavos,
  getUsdPhpReferenceQuoteOrNull,
} from '@/lib/billing/fx'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date)
}

function usd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function php(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100)
}

export default async function PlatformPlanValidationPage() {
  const [report, usdPhpQuote] = await Promise.all([
    getPlanAcceptanceReport(),
    getUsdPhpReferenceQuoteOrNull(),
  ])

  const stateCards = [
    ['Subscriptions', report.subscriptions.total],
    ['Expired trials', report.subscriptions.expiredTrialing],
    ['Invalid downgrades', report.subscriptions.invalidScheduledDowngrade],
    ['Invalid upgrades', report.subscriptions.invalidActiveUpgradeTarget],
    ['Expired checkouts', report.subscriptions.expiredPendingCheckout],
    ['Enterprise active', report.subscriptions.activeEnterprise],
  ] as const

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/acceptance"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Production Acceptance
        </Link>

        <p className="mt-5 text-sm font-medium text-blue-300">
          Pricing & entitlement final acceptance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Plan & Entitlement Validation
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Read-only validation of the canonical Starter, Professional, Business,
          and Enterprise plan rows, persisted entitlements and limits, and live
          subscription plan-change state. External provider and role/session
          scenarios remain manual acceptance tests.
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
                ? 'Automated plan checks are healthy'
                : 'Plan acceptance requires review'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Acceptance score: {report.score}/100 · Checked{' '}
              {formatDate(report.checkedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {report.plans.map((plan) => (
          <article
            key={plan.code}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{plan.code}</p>
                <h2 className="mt-1 font-semibold text-white">{plan.name}</h2>
              </div>
              {plan.healthy ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-300" />
              )}
            </div>

            <p className="mt-4 text-2xl font-semibold text-white">
              {plan.code === 'enterprise' ? 'From ' : ''}
              {usd(plan.publicPriceUsdCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {usdPhpQuote ? (
                <>
                  Current PHP conversion:{' '}
                  {php(
                    convertUsdCentsToPhpCentavos(
                      plan.publicPriceUsdCents,
                      usdPhpQuote.rate,
                    ),
                  )}{' '}
                  at USD/PHP {usdPhpQuote.rate.toFixed(4)}
                </>
              ) : (
                'PHP conversion is calculated at checkout.'
              )}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {plan.entitlementCount} entitlements ·{' '}
              {plan.selfService ? 'self-service' : 'assisted onboarding'}
            </p>

            {plan.issues.length > 0 ? (
              <ul className="mt-4 space-y-2 text-xs leading-5 text-amber-200">
                {plan.issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stateCards.map(([label, value]) => (
          <article
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {value.toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Trial switches', report.lifecycle.trialPlanChanges],
          ['Downgrades scheduled', report.lifecycle.planChangesScheduled],
          ['Plan changes applied', report.lifecycle.planChangesApplied],
          ['Paid lifecycle events', report.lifecycle.paidEvents],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
          >
            <CreditCard className="h-5 w-5 text-blue-300" />
            <p className="mt-4 text-sm text-slate-500">{String(label)}</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {Number(value).toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Automated findings</h2>
          <p className="mt-1 text-sm text-slate-500">
            These checks are read-only and never mutate customer subscriptions,
            payments, plan limits, or data.
          </p>
        </div>

        {report.issues.length === 0 ? (
          <div className="px-6 py-10">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No automated plan inconsistencies detected.
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

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-blue-300" />
            <div>
              <h2 className="font-semibold text-white">
                Required manual end-to-end scenarios
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Real sessions and PayMongo test-mode transactions are required;
                Flowtix does not fabricate pass results for these checks.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {report.manualScenarios.map((scenario) => (
            <div key={scenario.key} className="px-6 py-5">
              <p className="font-semibold text-white">{scenario.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {scenario.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <p className="text-sm leading-6 text-slate-400">
            Enterprise is intentionally excluded from new self-service signup and
            upgrades. Existing Enterprise subscriptions are preserved, but any
            active Enterprise workspace must have its negotiated custom capacity
            and policy verified during assisted onboarding before final production
            acceptance.
          </p>
        </div>
      </section>
    </div>
  )
}
