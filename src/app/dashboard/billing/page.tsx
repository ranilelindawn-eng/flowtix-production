import {
  AlertTriangle,
  Check,
  CreditCard,
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
  if (cents === 0) {
    return 'Custom'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) {
    return `${Math.max(
      0,
      Math.round(bytes / 1024),
    )} KB`
  }

  if (bytes < 1024 ** 3) {
    return `${(
      bytes /
      1024 ** 2
    ).toFixed(1)} MB`
  }

  return `${(
    bytes /
    1024 ** 3
  ).toFixed(1)} GB`
}

function getPayMongoPlanCode(
  subscription: unknown,
): string | null {
  if (
    typeof subscription !== 'object' ||
    subscription === null ||
    !('paymongo_plan_code' in subscription)
  ) {
    return null
  }

  const value = subscription.paymongo_plan_code

  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<
      string,
      string | string[] | undefined
    >
  >
}) {
  const organization =
    await requirePermission('billing.view')

  const [
    plans,
    subscription,
    usage,
    query,
  ] = await Promise.all([
    getPlans(),
    getCurrentSubscription(),
    getUsageSnapshot(),
    searchParams,
  ])

  const canManage =
    organization.role === 'owner'

  const checkoutState =
    typeof query.checkout === 'string'
      ? query.checkout
      : null
  const requestedFeature =
    typeof query.feature === 'string'
      ? query.feature
      : null

  const paymongoPlanCode =
    getPayMongoPlanCode(subscription)

  const pendingPlan =
    subscription?.status === 'pending' &&
    paymongoPlanCode
      ? plans.find(
          (plan) =>
            plan.code === paymongoPlanCode ||
            plan.code ===
              (paymongoPlanCode === 'professional'
                ? 'pro'
                : paymongoPlanCode),
        ) ?? null
      : null

  const activePlan =
    subscription?.plan ?? null

  const displayedPlanName =
    pendingPlan?.name ??
    usage?.planName ??
    activePlan?.name ??
    'Starter'

  const displayedStatus = pendingPlan
    ? 'Pending payment'
    : (
        usage?.subscriptionStatus ??
        subscription?.status ??
        'active'
      )

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-cyan-400">
          Workspace billing
        </p>

        <h1 className="mt-1 text-3xl font-bold text-white">
          Plans, Subscription &amp; Usage
        </h1>

        <p className="mt-2 text-slate-400">
          Manage your Flowtix subscription,
          upgrades, downgrades, and workspace
          limits through PayMongo.
        </p>
      </div>

      {requestedFeature ? (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Your current plan does not include{' '}
          <span className="font-semibold">
            {requestedFeature}
          </span>
          . Choose a plan that includes this feature.
        </div>
      ) : null}

      {checkoutState === 'success' ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Checkout completed. Your payment is
          being processed. Your selected plan
          will activate after PayMongo confirms
          the payment.
        </div>
      ) : null}

      {checkoutState === 'cancelled' ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Checkout was cancelled. Your current
          active plan was not changed.
        </div>
      ) : null}

      {pendingPlan ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Your {pendingPlan.name} plan is waiting
          for payment confirmation. Starter limits
          remain active until PayMongo confirms the
          payment.
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />

              <p className="text-sm text-slate-400">
                {pendingPlan
                  ? 'Selected workspace plan'
                  : 'Current workspace plan'}
              </p>
            </div>

            <p className="mt-2 text-2xl font-bold text-white">
              {displayedPlanName}
            </p>

            <p className="mt-1 text-sm capitalize text-slate-400">
              Status: {displayedStatus}
            </p>

            {pendingPlan &&
            activePlan?.name ? (
              <p className="mt-2 text-sm text-slate-400">
                Current active plan:{' '}
                <span className="font-medium text-white">
                  {activePlan.name}
                </span>
              </p>
            ) : null}

            {usage?.cancelAtPeriodEnd ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Cancels at the end of the current
                billing period.
              </p>
            ) : null}
          </div>

          {canManage ? (
            <a
              href="#available-plans"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              <CreditCard className="h-4 w-4" />
              Manage subscription
            </a>
          ) : null}
        </div>
      </section>

      {usage ? (
        <section>
          <h2 className="text-xl font-bold text-white">
            Current usage
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Limits are enforced in PostgreSQL so
            they cannot be bypassed from the
            browser.
          </p>

          {pendingPlan ? (
            <p className="mt-2 text-sm text-amber-300">
              These usage limits belong to your
              currently active plan. Your{' '}
              {pendingPlan.name} limits will apply
              after successful payment
              confirmation.
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

            <UsageMeter
              label="AI requests this month"
              used={usage.aiRequests.used}
              limit={usage.aiRequests.limit}
            />

            <UsageMeter
              label="Emails this month"
              used={usage.emails.used}
              limit={usage.emails.limit}
            />

            <UsageMeter
              label="SMS this month"
              used={usage.sms.used}
              limit={usage.sms.limit}
            />

            <UsageMeter
              label="Phone numbers"
              used={usage.phoneNumbers.used}
              limit={usage.phoneNumbers.limit}
            />

            <UsageMeter
              label="Active API keys"
              used={usage.apiKeys.used}
              limit={usage.apiKeys.limit}
            />
          </div>
        </section>
      ) : null}

      <section
        id="available-plans"
        className="scroll-mt-24"
      >
        <h2 className="text-xl font-bold text-white">
          Available plans
        </h2>

        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isPendingPlan =
              pendingPlan?.id === plan.id

            const isActivePlan =
              !pendingPlan &&
              (activePlan?.id === plan.id ||
                usage?.planCode === plan.code)

            const highlighted =
              isPendingPlan || isActivePlan

            return (
              <article
                key={plan.id}
                className={`rounded-2xl border p-6 ${
                  highlighted
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

                  {isPendingPlan ? (
                    <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                      Pending payment
                    </span>
                  ) : isActivePlan ? (
                    <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
                      Current
                    </span>
                  ) : null}
                </div>

                <p className="mt-6 text-4xl font-bold text-white">
                  {formatPrice(
                    plan.monthly_price_cents,
                  )}

                  {plan.monthly_price_cents > 0 ? (
                    <span className="text-sm font-normal text-slate-400">
                      /month
                    </span>
                  ) : null}
                </p>

                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {plan.features.map(
                    (feature) => (
                      <li
                        key={feature}
                        className="flex gap-2"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <span>{feature}</span>
                      </li>
                    ),
                  )}
                </ul>

                <div className="mt-6">
                  {isPendingPlan ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-semibold text-amber-300"
                    >
                      Payment pending
                    </button>
                  ) : isActivePlan ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-500"
                    >
                      Current plan
                    </button>
                  ) : canManage ? (
                    <form
                      action="/api/paymongo/checkout"
                      method="post"
                    >
                      <input
                        type="hidden"
                        name="plan"
                        value={plan.name}
                      />

                      <input
                        type="hidden"
                        name="amount"
                        value={
                          plan.monthly_price_cents /
                          100
                        }
                      />

                      <input
                        type="hidden"
                        name="description"
                        value={
                          plan.description ?? ''
                        }
                      />

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
                      >
                        Choose {plan.name}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-500"
                    >
                      Owner access required
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