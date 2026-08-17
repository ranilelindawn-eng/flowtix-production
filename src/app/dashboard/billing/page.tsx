import Link from 'next/link'
import {
  AlertTriangle,
  Check,
  CreditCard,
  ShieldCheck,
} from 'lucide-react'

import { UsageMeter } from '@/components/billing/UsageMeter'
import { requirePermission } from '@/lib/auth'
import type { OrganizationSubscription } from '@/lib/billing'
import {
  getCurrentSubscription,
  getPlans,
} from '@/lib/billing'
import {
  getFeatureLabel,
  getMinimumPlanForFeature,
  getPlanDefinition,
  isFeatureEntitlement,
} from '@/lib/plans/catalog'
import { getUsageSnapshot } from '@/lib/usage-limits'

import { getCurrentOrganizationTimezone } from '@/lib/team'

function formatPayMongoPrice(cents: number) {
  if (cents === 0) {
    return 'Custom'
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatPublicPrice(cents: number) {
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

function hasCurrentPaidPeriod(
  subscription: OrganizationSubscription | null,
): boolean {
  if (
    !subscription ||
    subscription.status !== 'active' ||
    !subscription.current_period_end
  ) {
    return false
  }

  return Date.parse(subscription.current_period_end) > Date.now()
}

function isCancelableActiveSubscription(
  subscription: OrganizationSubscription | null,
): boolean {
  if (!hasCurrentPaidPeriod(subscription)) {
    return false
  }

  const planCode =
    subscription?.plan?.code ?? subscription?.paymongo_plan_code

  return planCode !== 'starter'
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
  const timeZone = await getCurrentOrganizationTimezone()
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
  const subscriptionState =
    typeof query.subscription === 'string'
      ? query.subscription
      : null
  const requestedFeature =
    typeof query.feature === 'string'
      ? query.feature
      : null
  const requestedFeatureEntitlement =
    isFeatureEntitlement(requestedFeature)
      ? requestedFeature
      : null
  const requestedFeatureLabel = requestedFeatureEntitlement
    ? getFeatureLabel(requestedFeatureEntitlement)
    : requestedFeature
  const requestedFeaturePlan = requestedFeatureEntitlement
    ? getMinimumPlanForFeature(requestedFeatureEntitlement)
    : null
  const trialState =
    typeof query.trial === 'string'
      ? query.trial
      : null

  const pendingCheckout =
    subscription?.pending_plan_id !== null &&
    subscription?.last_payment_status === 'pending' &&
    subscription?.pending_checkout_expires_at !== null &&
    subscription?.paymongo_checkout_id !== null

  const trialActive =
    subscription?.status === 'trialing'

  const trialExpired =
    subscription?.status === 'pending' &&
    subscription?.last_payment_status === 'trial_expired'

  const pendingPlan =
    pendingCheckout &&
    subscription?.pending_plan_id
      ? plans.find(
          (plan) =>
            plan.id === subscription.pending_plan_id,
        ) ?? null
      : null

  const scheduledPlan =
    subscription?.scheduled_plan_id
      ? plans.find(
          (plan) =>
            plan.id === subscription.scheduled_plan_id,
        ) ?? null
      : null

  const activePlan =
    subscription?.plan ?? null

  const activePaidPeriod =
    hasCurrentPaidPeriod(subscription) && activePlan !== null

  const checkoutPaymentConfirmed =
    checkoutState === 'success' &&
    subscription?.status === 'active' &&
    !pendingPlan

  const displayedPlanName =
    pendingPlan?.name ??
    usage?.planName ??
    activePlan?.name ??
    'Starter'

  const displayedStatus = trialActive
    ? '7-day free trial'
    : trialExpired
      ? 'Trial ended — payment required'
      : pendingPlan
        ? 'Pending payment'
        : (
            usage?.subscriptionStatus ??
            subscription?.status ??
            'active'
          )

  const nullLimitLabel =
    usage?.planCode === 'enterprise'
      ? 'Custom'
      : 'No plan limit'

  // The cancellation button must only render for active paid subscriptions
  // that have a valid future period end.
  const canCancelActiveSubscription =
    isCancelableActiveSubscription(
      subscription as OrganizationSubscription | null,
    )

  return (
    <div className="space-y-8">
      <div className="flex justify-end"><a href="/dashboard/billing/invoices" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Invoices and usage billing</a></div>
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

      {trialState === 'started' && trialActive ? (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Your 7-day free trial is active. No payment was taken today.
          {subscription?.trial_ends_at
            ? ` Your trial ends ${new Date(subscription.trial_ends_at).toLocaleString('en-PH', {
                timeZone,
                dateStyle: 'medium',
                timeStyle: 'short',
              })}.`
            : ''}
        </div>
      ) : null}

      {trialState === 'plan-changed' && trialActive ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Trial plan changed successfully. No payment was taken, and your
          original 7-day trial end date is unchanged.
        </div>
      ) : null}

      {trialActive ? (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
          You are using the {activePlan?.name ?? displayedPlanName} plan during
          your free trial. You can switch trial plans without being charged,
          and your original trial end date will not change. When the trial
          ends, complete PayMongo checkout to continue.
        </div>
      ) : null}

      {trialExpired ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Your 7-day free trial has ended. Choose a plan below and complete
          PayMongo checkout to restore paid workspace access.
        </div>
      ) : null}

      {requestedFeatureLabel ? (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Your current plan does not include{' '}
          <span className="font-semibold">
            {requestedFeatureLabel}
          </span>
          {requestedFeaturePlan
            ? `. Choose ${requestedFeaturePlan.name} or a higher plan to unlock it.`
            : '. Choose a plan that includes this feature.'}
        </div>
      ) : null}

      {checkoutState === 'success' ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {checkoutPaymentConfirmed
            ? 'Payment confirmed. Your selected plan is active.'
            : 'Checkout completed. Your payment is being processed. Your selected plan will activate after PayMongo confirms the payment.'}
        </div>
      ) : null}

      {checkoutState === 'cancelled' ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Checkout was cancelled. Your current
          active plan was not changed.
        </div>
      ) : null}

      {subscriptionState === 'cancel_scheduled' ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Cancellation is scheduled for the end of the current billing period.
        </div>
      ) : null}

      {subscriptionState === 'reactivated' ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          The scheduled cancellation was removed.
        </div>
      ) : null}

      {subscriptionState === 'plan_scheduled' ? (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Your downgrade was scheduled for the end of the current billing
          period. Your current plan remains active until then.
        </div>
      ) : null}

      {subscriptionState === 'plan_change_cancelled' ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          The scheduled plan change was cancelled. Your current plan will
          continue.
        </div>
      ) : null}

      {scheduledPlan ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold">
                {scheduledPlan.name}
              </span>{' '}
              is scheduled to replace your current plan
              {subscription?.scheduled_plan_effective_at
                ? ` on ${new Date(
                    subscription.scheduled_plan_effective_at,
                  ).toLocaleString('en-PH', {
                    timeZone,
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}`
                : ' at the end of the current billing period'}
              . Your existing data will not be deleted. The new plan&apos;s
              entitlements and limits apply when the change becomes effective,
              and PayMongo renewal payment will be required for the new period.
            </div>

            {canManage ? (
              <form
                action="/api/paymongo/subscription/cancel-plan-change"
                method="post"
                className="shrink-0"
              >
                <button className="rounded-xl border border-amber-400/40 px-3 py-2 font-semibold text-amber-100 transition hover:bg-amber-500/10">
                  Keep current plan
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingPlan ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Your {pendingPlan.name} plan is waiting
          for payment confirmation. Your{' '}
          {activePlan?.name ?? usage?.planName ?? 'current plan'} entitlements
          and limits remain active until PayMongo confirms the payment.
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
            <div className="flex flex-wrap gap-3">
              <a
                href="#available-plans"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
              >
                <CreditCard className="h-4 w-4" />
                Manage subscription
              </a>

              {pendingPlan ? (
                <form action="/api/paymongo/checkout/cancel" method="post">
                  <button className="rounded-xl border border-amber-500/40 px-4 py-3 font-semibold text-amber-300 transition hover:bg-amber-500/10">
                    Cancel pending checkout
                  </button>
                </form>
              ) : subscription?.cancel_at_period_end ? (
                <form action="/api/paymongo/subscription/reactivate" method="post">
                  <button className="rounded-xl border border-emerald-500/40 px-4 py-3 font-semibold text-emerald-300 transition hover:bg-emerald-500/10">
                    Keep subscription active
                  </button>
                </form>
              ) : canCancelActiveSubscription ? (
                <form action="/api/paymongo/subscription/cancel" method="post">
                  <button className="rounded-xl border border-rose-500/40 px-4 py-3 font-semibold text-rose-300 transition hover:bg-rose-500/10">
                    Cancel at period end
                  </button>
                </form>
              ) : null}
            </div>
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

          {trialActive ? (
            <p className="mt-2 text-sm text-cyan-300">
              These limits belong to your selected trial plan. Payment is not
              required until you choose to continue after the trial.
            </p>
          ) : null}

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
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="Contacts"
              used={usage.contacts.used}
              limit={usage.contacts.limit}
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="Calls this month"
              used={usage.calls.used}
              limit={usage.calls.limit}
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="Private storage"
              used={usage.storage.used}
              limit={usage.storage.limit}
              nullLimitLabel={nullLimitLabel}
              formatter={formatBytes}
            />

            <UsageMeter
              label="AI requests this month"
              used={usage.aiRequests.used}
              limit={usage.aiRequests.limit}
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="Emails this month"
              used={usage.emails.used}
              limit={usage.emails.limit}
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="SMS this month"
              used={usage.sms.used}
              limit={usage.sms.limit}
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="Phone numbers"
              used={usage.phoneNumbers.used}
              limit={usage.phoneNumbers.limit}
              nullLimitLabel={nullLimitLabel}
            />

            <UsageMeter
              label="Active API keys"
              used={usage.apiKeys.used}
              limit={usage.apiKeys.limit}
              nullLimitLabel={nullLimitLabel}
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
            const catalogPlan = getPlanDefinition(plan.code)
            const isPendingPlan =
              pendingPlan?.id === plan.id

            const isScheduledPlan =
              scheduledPlan?.id === plan.id

            const isActivePlan =
              !trialExpired &&
              (subscription?.status === 'active' ||
                subscription?.status === 'trialing') &&
              (activePlan?.id === plan.id ||
                usage?.planCode === plan.code)

            const isDowngrade =
              activePaidPeriod &&
              activePlan !== null &&
              plan.sort_order < activePlan.sort_order

            const highlighted =
              isPendingPlan || isScheduledPlan || isActivePlan

            const currentPlanCode =
              activePlan?.code ?? subscription?.paymongo_plan_code
            const requiresAssistedEnterpriseOnboarding =
              catalogPlan?.selfService === false &&
              currentPlanCode !== 'enterprise'

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
                      {catalogPlan?.description ?? plan.description}
                    </p>
                  </div>

                  {isPendingPlan ? (
                    <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                      Pending payment
                    </span>
                  ) : isScheduledPlan ? (
                    <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                      Scheduled
                    </span>
                  ) : isActivePlan ? (
                    <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
                      Current
                    </span>
                  ) : null}
                </div>

                <div className="mt-6">
                  <p className="text-4xl font-bold text-white">
                    {catalogPlan
                      ? `${catalogPlan.priceStartsAt ? 'From ' : ''}${formatPublicPrice(catalogPlan.publicPriceUsdCents)}`
                      : 'Plan price'}
                    <span className="text-sm font-normal text-slate-400">
                      /month
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {catalogPlan?.selfService === false ? (
                      <>
                        Enterprise billing is configured during assisted onboarding.
                        The current PayMongo reference amount is{' '}
                        <span className="font-medium text-slate-300">
                          {formatPayMongoPrice(plan.monthly_price_cents)}/month
                        </span>
                        .
                      </>
                    ) : (
                      <>
                        Current PayMongo checkout amount:{' '}
                        <span className="font-medium text-slate-300">
                          {formatPayMongoPrice(plan.monthly_price_cents)}/month
                        </span>
                        . PayMongo settlement is processed in PHP.
                      </>
                    )}
                  </p>
                </div>

                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {(catalogPlan?.marketingFeatures ?? plan.features).map(
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
                  ) : isScheduledPlan ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-semibold text-amber-300"
                    >
                      Scheduled for period end
                    </button>
                  ) : isActivePlan ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-500"
                    >
                      Current plan
                    </button>
                  ) : pendingPlan ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-500"
                    >
                      Complete or cancel pending payment
                    </button>
                  ) : requiresAssistedEnterpriseOnboarding ? (
                    <Link
                      href="/contact?topic=enterprise"
                      className="block w-full rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-center font-semibold text-blue-200 transition hover:bg-blue-500/15"
                    >
                      Contact Flowtix
                    </Link>
                  ) : canManage ? (
                    <form
                      action={
                        isDowngrade
                          ? '/api/paymongo/subscription/change-plan'
                          : '/api/paymongo/checkout'
                      }
                      method="post"
                    >
                      <input
                        type="hidden"
                        name="plan"
                        value={plan.code}
                      />

                      {isDowngrade ? (
                        <input
                          type="hidden"
                          name="effective"
                          value="period_end"
                        />
                      ) : null}

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
                      >
                        {trialActive
                          ? `Use ${plan.name} for trial`
                          : isDowngrade
                            ? `Schedule ${plan.name} downgrade`
                            : subscription?.status === 'past_due' &&
                                activePlan?.id === plan.id
                              ? `Renew ${plan.name}`
                              : activePaidPeriod
                                ? `Upgrade to ${plan.name}`
                                : `Choose ${plan.name}`}
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
