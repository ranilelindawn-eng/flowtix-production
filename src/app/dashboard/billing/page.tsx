import {
  AlertTriangle,
  Check,
  ShieldCheck,
} from 'lucide-react'

import { UsageMeter } from '@/components/billing/UsageMeter'
import { requirePermission } from '@/lib/auth'
import {
  getCurrentSubscription,
  getPlans,
} from '@/lib/billing'
import { getUsageSnapshot } from '@/lib/usage-limits'

function formatPrice(cents: number) {
  if (cents === 0) return 'Custom'

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) {
    return `${Math.max(0, Math.round(bytes / 1024))} KB`
  }

  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }

  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

type BillingPageProps = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >
}

export default async function BillingPage({
  searchParams,
}: BillingPageProps) {
  const organization = await requirePermission('billing.view')
  const [plans, subscription, usage, query] = await Promise.all([
    getPlans(),
    getCurrentSubscription(),
    getUsageSnapshot(),
    searchParams,
  ])

  const canManage = organization.role === 'owner'
  const checkoutState =
    typeof query.checkout === 'string'
      ? query.checkout
      : null

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-cyan-400">
          Workspace billing
        </p>
        <h1 className="mt-1 text-3xl font-bold text-white">
          Plans, Subscription & Usage
        </h1>
        <p className="mt-2 text-slate-400">
          Secure PayMongo checkout and enforced workspace limits.
        </p>
      </div>

      {checkoutState === 'success' ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Payment completed. PayMongo is updating your workspace
          subscription.
        </div>
      ) : null}

      {checkoutState === 'cancelled' ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Checkout was cancelled. Your current plan was not changed.
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
              <p className="text-sm text-slate-400">
                Current workspace plan
              </p>
            </div>

            <p className="mt-2 text-2xl font-bold text-white">
              {usage?.planName ??
                subscription?.plan?.name ??
                'Starter'}
            </p>

            <p className="mt-1 text-sm capitalize text-slate-400">
              Status:{' '}
              {usage?.subscriptionStatus ??
                subscription?.status ??
                'active'}
            </p>

            {usage?.cancelAtPeriodEnd ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Cancels at the end of the current billing period.
              </p>
            ) : null}
          </div>


        </div>
      </section>

      {usage ? (
        <section>
          <h2 className="text-xl font-bold text-white">
            Current usage
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Limits are enforced in PostgreSQL so they cannot be
            bypassed from the browser.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <UsageMeter
              label="Team seats"
              used={usage.members.used}
              limit={usage.members.limit}
            />
            <UsageMeter
              label="Contacts"
              used={usage.contacts.used}
              limit={usage.contacts.limit}
            />
            <UsageMeter
              label="Calls this month"
              used={usage.calls.used}
              limit={usage.calls.limit}
            />
            <UsageMeter
              label="Private storage"
              used={usage.storage.used}
              limit={usage.storage.limit}
              formatter={formatBytes}
            />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-white">
          Available plans
        </h2>

        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const current =
              subscription?.plan?.id === plan.id ||
              usage?.planCode === plan.code

            return (
              <article
                key={plan.id}
                className={`rounded-2xl border p-6 ${
                  current
                    ? 'border-cyan-500/60 bg-cyan-500/5'
                    : 'border-slate-800 bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {plan.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {plan.description}
                    </p>
                  </div>

                  {current ? (
                    <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
                      Current
                    </span>
                  ) : null}
                </div>

                <p className="mt-6 text-4xl font-bold text-white">
                  {formatPrice(plan.monthly_price_cents)}
                  {plan.monthly_price_cents > 0 ? (
                    <span className="text-sm font-normal text-slate-400">
                      /month
                    </span>
                  ) : null}
                </p>

                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-cyan-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {current ? (
                    <button
                      disabled
                      className="w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-500"
                    >
                      Current plan
                    </button>
                  ) : plan.monthly_price_cents > 0 && canManage ? (
                    <form
                      action="/api/paymongo/checkout"
                      method="post"
                    >
                      <input
                        type="hidden"
                        name="planId"
                        value={plan.id}
                      />
                      <input
                        type="hidden"
                        name="planCode"
                        value={plan.code}
                      />
                      <button className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500">
                        Choose {plan.name}
                      </button>
                    </form>
                  ) : (
                    <button
                      disabled
                      className="w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-500"
                    >
                      {canManage
                        ? 'Contact sales'
                        : 'Owner access required'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}