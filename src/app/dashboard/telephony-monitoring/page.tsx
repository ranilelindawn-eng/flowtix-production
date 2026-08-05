import { Activity, AlertTriangle, Clock3, PhoneCall, Radio, Route, UsersRound } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import { getFreshTelephonyMonitoringOverview } from '@/lib/telephony/monitoring/service'

export const dynamic = 'force-dynamic'

function formatSeconds(value: number | null): string {
  if (value === null) return '—'
  if (value < 60) return `${Math.round(value)}s`
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`
}

export default async function TelephonyMonitoringPage() {
  const organization = await requirePermission('calls.view')
  const overview = await getFreshTelephonyMonitoringOverview(organization.organization_id)
  const snapshot = overview.snapshot
  const providerEntries = Object.entries(snapshot?.providerBreakdown ?? {}) as Array<[string, number]>
  const routingEntries = Object.entries(snapshot?.routingBreakdown ?? {}) as Array<[string, number]>
  const cards = [
    { label: 'Active calls', value: snapshot?.activeCalls ?? 0, icon: PhoneCall },
    { label: 'Queue waiting', value: snapshot?.waitingQueueEntries ?? 0, icon: Clock3 },
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
    ['Oldest queue wait', formatSeconds(snapshot?.oldestQueueWaitSeconds ?? 0)],
    ['Routing failures', snapshot?.routingFailuresLastHour ?? 0],
    ['Provider errors', snapshot?.providerErrorsLastHour ?? 0],
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Operations</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Telephony monitoring</h1>
        <p className="mt-2 text-sm text-slate-400">
          Routing, queues, providers, agents, alerts, and operational health in one tenant-scoped view.
        </p>
      </div>

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

      <div className="grid gap-6 lg:grid-cols-2">
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

        <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-cyan-300" />
            <h2 className="font-semibold text-white">Routing diagnostics</h2>
          </div>
          <div className="mt-4 space-y-3">
            {routingEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No routing attempts in the last hour.</p>
            ) : (
              routingEntries.map(([strategy, total]) => (
                <div
                  key={strategy}
                  className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3"
                >
                  <span className="capitalize text-slate-300">{strategy.replaceAll('_', ' ')}</span>
                  <span className="font-semibold text-white">{total}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <p className="text-xs text-slate-500">
        Last captured {snapshot ? new Date(snapshot.capturedAt).toLocaleString() : 'not yet available'}.
      </p>
    </div>
  )
}
