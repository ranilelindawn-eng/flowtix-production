import Link from 'next/link'
import { BadgeDollarSign, CalendarClock, CircleDollarSign, Gauge, Target, Trophy } from 'lucide-react'
import MetricCard from '@/components/reports/MetricCard'
import { getSalesAnalyticsOverview, normalizeSalesAnalyticsPeriod } from '@/lib/analytics/sales'

type Props = { searchParams: Promise<{ period?: string }> }

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`
}

export default async function SalesAnalyticsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = normalizeSalesAnalyticsPeriod(params.period)
  const { snapshot, history } = await getSalesAnalyticsOverview(period)
  const ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '1 year']] as const

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[.24em] text-cyan-400">Revenue intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Sales analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Analyze pipeline health, stage velocity, forecast composition, win rates, sources, and owner performance from durable tenant-scoped snapshots.</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Sales analytics period">
          {ranges.map(([value, label]) => <Link key={value} href={`/dashboard/sales-analytics?period=${value}`} className={period === value ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white' : 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white'}>{label}</Link>)}
        </nav>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Won revenue" value={money(snapshot.wonRevenue, snapshot.currencyCode)} helper={`${snapshot.wonDeals} won deals`} icon={<Trophy className="h-5 w-5" />} />
        <MetricCard label="Open pipeline" value={money(snapshot.pipelineValue, snapshot.currencyCode)} helper={`${money(snapshot.weightedPipelineValue, snapshot.currencyCode)} weighted`} icon={<CircleDollarSign className="h-5 w-5" />} />
        <MetricCard label="Win rate" value={percent(snapshot.winRate)} helper={`${snapshot.wonDeals} won · ${snapshot.lostDeals} lost`} icon={<Target className="h-5 w-5" />} />
        <MetricCard label="Average deal size" value={money(snapshot.averageDealSize, snapshot.currencyCode)} helper={`${snapshot.createdDeals} created in period`} icon={<BadgeDollarSign className="h-5 w-5" />} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sales cycle" value={`${snapshot.averageSalesCycleDays.toFixed(1)} days`} helper="Average won-deal duration" icon={<CalendarClock className="h-5 w-5" />} />
        <MetricCard label="Stale deals" value={snapshot.staleDeals.toLocaleString()} helper="Past pipeline stale threshold" icon={<Gauge className="h-5 w-5" />} />
        <MetricCard label="Overdue next steps" value={snapshot.overdueNextSteps.toLocaleString()} helper="Open deals needing follow-up" icon={<CalendarClock className="h-5 w-5" />} />
        <MetricCard label="Snapshots" value={history.length.toLocaleString()} helper={`Captured ${new Date(snapshot.capturedAt).toLocaleString()}`} icon={<Gauge className="h-5 w-5" />} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6">
        <h2 className="text-lg font-semibold text-white">Pipeline stage performance</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[.15em] text-slate-500"><tr><th className="pb-3">Stage</th><th className="pb-3">Deals</th><th className="pb-3">Value</th><th className="pb-3">Weighted</th><th className="pb-3">Avg. age</th><th className="pb-3">Days in stage</th></tr></thead>
            <tbody className="divide-y divide-white/5">{snapshot.stages.map((stage) => <tr key={stage.stageId ?? stage.stageName}><td className="py-3 font-medium text-white">{stage.stageName}<span className="ml-2 rounded-full bg-white/5 px-2 py-1 text-xs text-slate-400">{stage.stageType}</span></td><td className="py-3 text-slate-300">{stage.dealCount}</td><td className="py-3 text-slate-300">{money(stage.totalValue, snapshot.currencyCode)}</td><td className="py-3 text-slate-300">{money(stage.weightedValue, snapshot.currencyCode)}</td><td className="py-3 text-slate-300">{stage.averageAgeDays.toFixed(1)}d</td><td className="py-3 text-slate-300">{stage.averageDaysInStage.toFixed(1)}d</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><h2 className="text-lg font-semibold text-white">Owner performance</h2><div className="mt-5 space-y-3">{snapshot.owners.slice(0, 10).map((owner) => <div key={owner.membershipId ?? owner.userId ?? owner.name} className="rounded-xl border border-white/5 bg-white/[.03] p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-medium text-white">{owner.name}</p><p className="mt-1 text-xs text-slate-500">{owner.openDeals} open · {owner.wonDeals} won · {owner.lostDeals} lost</p></div><div className="text-right"><p className="font-semibold text-cyan-300">{money(owner.wonRevenue, snapshot.currencyCode)}</p><p className="text-xs text-slate-500">{percent(owner.conversionRate)} win rate</p></div></div></div>)}</div></section>
        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><h2 className="text-lg font-semibold text-white">Forecast composition</h2><div className="mt-5 space-y-3">{snapshot.forecasts.map((forecast) => <div key={forecast.category} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[.03] p-4"><div><p className="capitalize font-medium text-white">{forecast.category.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{forecast.dealCount} deals</p></div><div className="text-right"><p className="font-semibold text-white">{money(forecast.totalValue, snapshot.currencyCode)}</p><p className="text-xs text-cyan-300">{money(forecast.weightedValue, snapshot.currencyCode)} weighted</p></div></div>)}</div></section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><h2 className="text-lg font-semibold text-white">Lead-source performance</h2><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{snapshot.sources.map((source) => <div key={source.source} className="rounded-xl border border-white/5 bg-white/[.03] p-4"><p className="font-medium text-white">{source.source}</p><p className="mt-2 text-2xl font-semibold text-cyan-300">{source.dealCount}</p><p className="mt-1 text-xs text-slate-500">{money(source.pipelineValue, snapshot.currencyCode)} pipeline · {money(source.wonRevenue, snapshot.currencyCode)} won</p></div>)}</div></section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
