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
import { getPlatformCustomerMetrics } from '@/lib/platform/customers'

export default async function PlatformDashboardPage() {
  const membership = await requirePlatformPermission('platform.dashboard.view')
  const customerMetrics = await getPlatformCustomerMetrics()

  const metrics = [
    { label: 'MRR', value: '—', detail: 'Billing metrics in Billing & PayMongo phase', icon: CreditCard },
    { label: 'ARR', value: '—', detail: 'Billing metrics in Billing & PayMongo phase', icon: CreditCard },
    { label: 'Active Customers', value: customerMetrics.activeSubscriptions.toLocaleString(), detail: `${customerMetrics.trialCustomers.toLocaleString()} trialing`, icon: Users },
    { label: 'Active Organizations', value: customerMetrics.activeOrganizations.toLocaleString(), detail: `${customerMetrics.suspendedOrganizations.toLocaleString()} suspended`, icon: Building2 },
    { label: 'User Count', value: customerMetrics.totalUsers.toLocaleString(), detail: 'Distinct active organization members', icon: Users },
    { label: 'AI Usage', value: '—', detail: 'Provider analytics pending', icon: Bot },
    { label: 'Telephony Usage', value: '—', detail: 'Provider analytics pending', icon: PhoneCall },
    { label: 'Failed Payments', value: '—', detail: 'PayMongo operations pending', icon: Activity },
    { label: 'Platform Health', value: 'Foundation ready', detail: 'Protected staff-only shell active', icon: HeartPulse },
  ]

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-blue-300">Flowtix internal operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Platform Dashboard</h1>
        <p className="mt-3 max-w-3xl text-slate-400">
          Platform Customer Management is active. Customer directory and organization-level customer visibility are staff-only; billing operations, providers, support impersonation, jobs, feature flags, and platform settings remain isolated for their dedicated phases.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300"><Icon className="h-5 w-5" /></div>
            </div>
            <p className="mt-4 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6">
        <h2 className="font-semibold text-emerald-200">Access isolation active</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Platform access comes only from the dedicated platform_users table and platform membership guard. Customer organization roles do not grant access. Current role:{' '}
          <span className="font-medium capitalize text-slate-200">{membership.role.replaceAll('_', ' ')}</span>.
        </p>
      </section>
    </div>
  )
}
