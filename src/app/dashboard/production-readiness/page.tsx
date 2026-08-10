import { getProductionReadinessOverview } from '@/lib/production'
import { requirePlatformPermission } from '@/lib/platform/auth'

import { getCurrentOrganizationTimezone } from '@/lib/team'
function badge(status: string) {
  if (status === 'healthy' || status === 'ready' || status === 'passed') return 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20'
  if (status === 'warning') return 'bg-amber-500/10 text-amber-300 ring-amber-400/20'
  return 'bg-rose-500/10 text-rose-300 ring-rose-400/20'
}

export default async function ProductionReadinessPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  await requirePlatformPermission('platform.settings.manage')
  const overview = await getProductionReadinessOverview()
  return <main className="space-y-8">
    <div><p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Production hardening</p><h1 className="mt-2 text-3xl font-semibold text-white">Launch readiness</h1><p className="mt-2 max-w-3xl text-slate-400">Operational health, validation, recovery, monitoring, logging, and launch controls for Flowtix.</p></div>
    <section className="grid gap-4 md:grid-cols-3"><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-slate-400">Readiness score</p><p className="mt-2 text-4xl font-semibold text-white">{overview.score}%</p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs ring-1 ${badge(overview.status)}`}>{overview.status}</span></div>{overview.metrics.slice(0,2).map(metric=><div key={metric.key} className="rounded-3xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-slate-400">{metric.label}</p><p className="mt-2 text-4xl font-semibold text-white">{metric.value}</p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs ring-1 ${badge(metric.status)}`}>{metric.status}</span></div>)}</section>
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Production controls</h2><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{overview.metrics.map(metric=><div key={metric.key} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-white">{metric.label}</p><span className={`rounded-full px-2.5 py-1 text-xs ring-1 ${badge(metric.status)}`}>{metric.status}</span></div><p className="mt-3 text-2xl font-semibold text-white">{metric.value}</p>{metric.detail?<p className="mt-2 text-sm text-slate-400">{metric.detail}</p>:null}</div>)}</div></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Open incidents</h2><div className="mt-4 space-y-3">{overview.incidents.length?overview.incidents.map(item=><div key={item.id} className="rounded-2xl border border-white/10 p-4"><div className="flex justify-between"><p className="font-medium text-white">{item.title}</p><span className={`rounded-full px-2 py-1 text-xs ring-1 ${badge(item.severity)}`}>{item.severity}</span></div><p className="mt-2 text-sm text-slate-400">{item.status} · {new Date(item.createdAt).toLocaleString('en-US', { timeZone })}</p></div>):<p className="text-sm text-slate-400">No open incidents.</p>}</div></div><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold text-white">Recovery history</h2><div className="mt-4 space-y-3">{overview.backups.length?overview.backups.map(item=><div key={item.id} className="rounded-2xl border border-white/10 p-4"><p className="font-medium text-white">{item.backupType}</p><p className="mt-2 text-sm text-slate-400">{item.status} · {new Date(item.createdAt).toLocaleString('en-US', { timeZone })}</p></div>):<p className="text-sm text-slate-400">No recovery records yet.</p>}</div></div></section>
  </main>
}
