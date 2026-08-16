import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  PhoneCall,
  Radio,
  UsersRound,
} from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import {
  getCurrentEntitlements,
  hasEntitlement,
} from '@/lib/entitlements'
import { runTelephonyAcceptanceValidation } from '@/lib/telephony/acceptance'
import { getFreshTelephonyMonitoringOverview } from '@/lib/telephony/monitoring/service'

import { getCurrentOrganizationTimezone } from '@/lib/team'
export const dynamic = 'force-dynamic'

function formatSeconds(value: number | null): string {
  if (value === null) return '—'
  if (value < 60) return `${Math.round(value)}s`
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`
}


function TelephonyMonitoringLocked({
  planName,
  subscriptionStatus,
}: {
  planName: string
  subscriptionStatus: string
}) {
  const statusLabel = subscriptionStatus
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Telephony monitoring
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Review outbound calling, provider health, agents, alerts, and operational
          readiness after Cloud Dialer is enabled for this organization.
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60">
        <div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/10 via-blue-400/5 to-transparent p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10">
                <LockKeyhole className="h-6 w-6 text-cyan-300" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Cloud Dialer is not enabled on the current plan
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Current plan: {planName} · Subscription: {statusLabel}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/billing?feature=dialer.cloud"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              <CreditCard className="h-4 w-4" />
              View eligible plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[
            {
              title: 'Live operational health',
              description:
                'Track active outbound calls, provider errors, and call-processing health.',
            },
            {
              title: 'Agent availability',
              description:
                'Monitor available agents and browser softphone readiness for outbound work.',
            },
            {
              title: 'Readiness validation',
              description:
                'Verify provider configuration, callback health, phone numbers, and database integrity.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {feature.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 bg-white/[0.02] px-6 py-4">
          <p className="text-sm text-slate-400">
            Telephony APIs and provider operations remain disabled until the
            <span className="font-medium text-slate-300"> dialer.cloud </span>
            entitlement is active.
          </p>
        </div>
      </section>
    </div>
  )
}

export default async function TelephonyMonitoringPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  const organization = await requirePermission('calls.view_all')
  const entitlements = await getCurrentEntitlements()

  if (
    !entitlements ||
    !hasEntitlement(entitlements, 'dialer.cloud')
  ) {
    return (
      <TelephonyMonitoringLocked
        planName={entitlements?.planName ?? 'No active plan'}
        subscriptionStatus={
          entitlements?.subscriptionStatus ?? 'inactive'
        }
      />
    )
  }
  const [overview, acceptance] = await Promise.all([
    getFreshTelephonyMonitoringOverview(organization.organization_id),
    runTelephonyAcceptanceValidation(organization.organization_id),
  ])
  const snapshot = overview.snapshot
  const providerEntries = Object.entries(snapshot?.providerBreakdown ?? {}) as Array<[string, number]>
  const cards = [
    { label: 'Active calls', value: snapshot?.activeCalls ?? 0, icon: PhoneCall },
    { label: 'Connected calls', value: snapshot?.connectedCalls ?? 0, icon: Activity },
    { label: 'Available agents', value: snapshot?.availableAgents ?? 0, icon: UsersRound },
    {
      label: 'Open alerts',
      value: overview.alerts.filter((alert) => alert.status === 'open').length,
      icon: AlertTriangle,
    },
  ]

  const diagnostics: Array<[string, string | number]> = [
    ['Calls last hour', snapshot?.callsLastHour ?? 0],
    ['Answer rate', `${Math.round((snapshot?.answerRate ?? 0) * 100)}%`],
    ['Average answer', formatSeconds(snapshot?.averageAnswerSeconds ?? null)],
    ['Failed calls', snapshot?.failedCallsLastHour ?? 0],
    ['Provider errors', snapshot?.providerErrorsLastHour ?? 0],
    ['Busy agents', snapshot?.busyAgents ?? 0],
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Operations</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Telephony monitoring</h1>
        <p className="mt-2 text-sm text-slate-400">
          Outbound calling, providers, agents, alerts, and operational health in one tenant-scoped view.
        </p>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Acceptance validation</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Telephony readiness: {acceptance.score}%</h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${
            acceptance.status === 'pass'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
              : acceptance.status === 'warning'
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
                : 'border-rose-400/20 bg-rose-400/10 text-rose-300'
          }`}>
            {acceptance.status}
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {acceptance.checks.map((item) => (
            <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <span className={`text-[10px] font-semibold uppercase ${
                  item.status === 'pass'
                    ? 'text-emerald-300'
                    : item.status === 'warning'
                      ? 'text-amber-300'
                      : 'text-rose-300'
                }`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{label}</p>
              <Icon className="h-5 w-5 text-cyan-300" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 xl:col-span-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-300" />
            <h2 className="font-semibold text-white">Operational diagnostics</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {diagnostics.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
            <h2 className="font-semibold text-white">Active alerts</h2>
          </div>
          <div className="mt-5 space-y-3">
            {overview.alerts.length === 0 ? (
              <p className="text-sm text-slate-400">No active telephony alerts.</p>
            ) : (
              overview.alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{alert.title}</p>
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase text-amber-300">
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{alert.message}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div>
        <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-300" />
            <h2 className="font-semibold text-white">Provider diagnostics</h2>
          </div>
          <div className="mt-4 space-y-3">
            {providerEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No provider traffic in the last hour.</p>
            ) : (
              providerEntries.map(([provider, total]) => (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3"
                >
                  <span className="capitalize text-slate-300">{provider}</span>
                  <span className="font-semibold text-white">{total}</span>
                </div>
              ))
            )}
          </div>
        </section>

      </div>

      <p className="text-xs text-slate-500">
        Last captured {snapshot ? new Date(snapshot.capturedAt).toLocaleString('en-US', { timeZone }) : 'not yet available'}.
      </p>
    </div>
  )
}
