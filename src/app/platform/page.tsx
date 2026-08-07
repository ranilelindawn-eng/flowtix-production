import {
  Activity,
  Bot,
  Building2,
  CreditCard,
  HeartPulse,
  PhoneCall,
  Users,
} from 'lucide-react'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { getPlatformAIMetrics, getPlatformAIProviders } from '@/lib/platform/ai'
import { getPlatformBillingMetrics } from '@/lib/platform/billing'
import { getPlatformCustomerMetrics } from '@/lib/platform/customers'
import { getPlatformHealthOverview } from '@/lib/platform/health'
import { hasPlatformPermission } from '@/lib/platform/permissions'
import { getPlatformSubscriptionMetrics } from '@/lib/platform/subscriptions'
import { getPlatformTelephonyMetrics } from '@/lib/platform/telephony'

type MetricCard = {
  label: string
  value: string
  detail: string
  icon: typeof Building2
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export default async function PlatformDashboardPage() {
  const membership = await requirePlatformPermission(
    'platform.dashboard.view',
  )

  const canViewCustomers = hasPlatformPermission(
    membership.role,
    'platform.customers.view',
  )
  const canManageSubscriptions = hasPlatformPermission(
    membership.role,
    'platform.subscriptions.manage',
  )
  const canViewBilling = hasPlatformPermission(
    membership.role,
    'platform.billing.view',
  )
  const canManageTelephony = hasPlatformPermission(
    membership.role,
    'platform.telephony.manage',
  )
  const canManageAI = hasPlatformPermission(
    membership.role,
    'platform.ai.manage',
  )
  const canViewHealth = hasPlatformPermission(
    membership.role,
    'platform.jobs.view',
  )

  const [
    customerMetrics,
    subscriptionMetrics,
    billingMetrics,
    telephonyMetrics,
    aiData,
    healthOverview,
  ] = await Promise.all([
    canViewCustomers
      ? getPlatformCustomerMetrics()
      : Promise.resolve(null),
    canManageSubscriptions
      ? getPlatformSubscriptionMetrics()
      : Promise.resolve(null),
    canViewBilling
      ? getPlatformBillingMetrics()
      : Promise.resolve(null),
    canManageTelephony
      ? getPlatformTelephonyMetrics()
      : Promise.resolve(null),
    canManageAI
      ? Promise.all([
          getPlatformAIMetrics(),
          getPlatformAIProviders(),
        ])
      : Promise.resolve(null),
    canViewHealth
      ? getPlatformHealthOverview()
      : Promise.resolve(null),
  ])

  const metrics: MetricCard[] = []

  if (subscriptionMetrics) {
    metrics.push(
      {
        label: 'MRR',
        value: money(subscriptionMetrics.mrrCents),
        detail: `${subscriptionMetrics.active} active subscriptions`,
        icon: CreditCard,
      },
      {
        label: 'ARR',
        value: money(subscriptionMetrics.arrCents),
        detail: `${subscriptionMetrics.trialing} trialing`,
        icon: CreditCard,
      },
    )
  }

  if (customerMetrics) {
    metrics.push(
      {
        label: 'Active Customers',
        value: customerMetrics.activeSubscriptions.toLocaleString(),
        detail: subscriptionMetrics
          ? `${subscriptionMetrics.pastDue} past due`
          : 'Subscription details restricted for this role',
        icon: Users,
      },
      {
        label: 'Active Organizations',
        value: customerMetrics.activeOrganizations.toLocaleString(),
        detail: `${customerMetrics.suspendedOrganizations.toLocaleString()} suspended`,
        icon: Building2,
      },
      {
        label: 'User Count',
        value: customerMetrics.totalUsers.toLocaleString(),
        detail: 'Distinct active organization members',
        icon: Users,
      },
    )
  }

  if (billingMetrics) {
    metrics.push(
      {
        label: 'Monthly Revenue',
        value: money(billingMetrics.revenueThisMonthCents),
        detail: `${billingMetrics.paidPaymentsThisMonth} paid payments`,
        icon: CreditCard,
      },
      {
        label: 'Failed Payments',
        value: billingMetrics.failedPayments.toLocaleString(),
        detail: `${billingMetrics.failedWebhookEvents} failed webhooks`,
        icon: Activity,
      },
    )
  }

  if (aiData) {
    const [aiMetrics, aiProviders] = aiData
    metrics.push({
      label: 'AI Usage',
      value: aiMetrics.requestsLast24Hours.toLocaleString(),
      detail: `${aiProviders.filter((provider) => provider.configured).length} configured providers · ${aiMetrics.failuresLast24Hours} failures / 24h`,
      icon: Bot,
    })
  }

  if (telephonyMetrics) {
    metrics.push({
      label: 'Telephony Usage',
      value: telephonyMetrics.callsLast24Hours.toLocaleString(),
      detail: `${telephonyMetrics.connectedIntegrations} connected providers · ${telephonyMetrics.providerErrorsLast24Hours} provider errors / 24h`,
      icon: PhoneCall,
    })
  }

  if (healthOverview) {
    metrics.push({
      label: 'Platform Health',
      value:
        healthOverview.status === 'healthy'
          ? 'Operational'
          : healthOverview.status === 'critical'
            ? 'Critical'
            : healthOverview.status === 'warning'
              ? 'Attention'
              : 'Unknown',
      detail: `Health score ${healthOverview.score}/100 · ${healthOverview.incidents.length} active incidents`,
      icon: HeartPulse,
    })
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-blue-300">
          Flowtix internal operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Platform Dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-slate-400">
          The dashboard displays only metrics authorized for the current
          Platform role. Customer organization roles never grant access to
          these internal operations.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {value}
                </p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6">
        <h2 className="font-semibold text-emerald-200">
          Access isolation active
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Platform access comes only from the dedicated platform_users table.
          Active Platform staff accounts are redirected away from the customer
          `/dashboard` and must use audited Platform support access when
          troubleshooting a customer organization. Current role:{' '}
          <span className="font-medium capitalize text-slate-200">
            {membership.role.replaceAll('_', ' ')}
          </span>.
        </p>
      </section>
    </div>
  )
}
