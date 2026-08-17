import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { redirect } from 'next/navigation'

import { requireOrganization } from '@/lib/auth'
import {
  getCurrentEntitlements,
  hasEntitlement,
} from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import {
  getEligiblePlansForFeature,
  getFeatureLabel,
  getMinimumPlanForFeature,
  isFeatureEntitlement,
} from '@/lib/plans/catalog'

type UpgradePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function formatStatus(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function joinPlanNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? 'an eligible plan'
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

export default async function UpgradePage({
  searchParams,
}: UpgradePageProps) {
  const organization = await requireOrganization()
  const query = await searchParams
  const rawFeature =
    typeof query.feature === 'string' ? query.feature : null

  if (!isFeatureEntitlement(rawFeature)) {
    redirect('/dashboard')
  }

  const snapshot = await getCurrentEntitlements()

  if (!snapshot) {
    redirect('/dashboard')
  }

  const feature = rawFeature
  const featureLabel = getFeatureLabel(feature)
  const requiredPlan = getMinimumPlanForFeature(feature)
  const eligiblePlans = getEligiblePlansForFeature(feature)
  const eligiblePlanNames = eligiblePlans.map((plan) => plan.name)
  const canManageBilling = hasPermission(
    organization.role,
    'billing.manage',
  )
  const alreadyIncluded = hasEntitlement(snapshot, feature)
  const statusLabel = formatStatus(snapshot.subscriptionStatus)

  if (!requiredPlan || eligiblePlans.length === 0) {
    redirect('/dashboard')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Plan access
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          {alreadyIncluded
            ? `${featureLabel} is included in your plan`
            : `${featureLabel} requires ${requiredPlan.name}`}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          {alreadyIncluded
            ? 'Your organization now has this entitlement. Return to the feature from the dashboard navigation.'
            : `${featureLabel} is available on ${joinPlanNames(eligiblePlanNames)}.`}
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/95 shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/10 via-blue-500/5 to-transparent p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 ring-1 ring-cyan-300/15">
                {alreadyIncluded ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-300" />
                ) : (
                  <LockKeyhole className="h-6 w-6 text-cyan-300" />
                )}
              </div>

              <div>
                <h2 className="text-lg font-semibold text-white">
                  {featureLabel}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Your current plan: <span className="font-semibold text-slate-200">{snapshot.planName}</span>
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Subscription status: <span className="font-semibold text-slate-200">{statusLabel}</span>
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Required plan: <span className="font-semibold text-cyan-200">{requiredPlan.name}</span>
                </p>
              </div>
            </div>

            {!alreadyIncluded && canManageBilling ? (
              <Link
                href={`/dashboard/billing?feature=${encodeURIComponent(feature)}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <CreditCard className="h-4 w-4" />
                Upgrade plan
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Existing data stays safe
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Plan restrictions lock premium functionality without deleting your organization data.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="text-sm font-semibold text-white">
              Eligible plans
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {joinPlanNames(eligiblePlanNames)}
            </p>
          </div>
        </div>

        {!alreadyIncluded && !canManageBilling ? (
          <div className="border-t border-white/10 bg-amber-400/[0.04] px-6 py-5 text-sm leading-6 text-amber-100 sm:px-8">
            Only a workspace owner with billing permission can change the subscription. Ask your workspace owner to upgrade to {requiredPlan.name} or higher.
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {alreadyIncluded && canManageBilling ? (
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
          >
            View billing
          </Link>
        ) : null}
      </div>
    </div>
  )
}
