import Link from 'next/link'
import { Activity, BadgeDollarSign, Clock3, PhoneCall, Target, TrendingDown, TrendingUp } from 'lucide-react'
import MetricCard from '@/components/reports/MetricCard'
import { getKpiOverview, type KpiPeriod, type KpiValue } from '@/lib/kpis'

type Props = { searchParams: Promise<{ period?: string }> }

function periodValue(value: string | undefined): KpiPeriod {
  return value === '7d' || value === '90d' || value === '365d' ? value : '30d'
}
function format(value: KpiValue): string {
  if (value.valueFormat === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value.value)
  if (value.valueFormat === 'percentage') return `${value.value.toFixed(1)}%`
  if (value.valueFormat === 'duration') {
    const minutes = Math.floor(value.value / 60)
    const seconds = Math.round(value.value % 60)
    return `${minutes}m ${seconds}s`
  }
  return value.value.toLocaleString()
}
function helper(value: KpiValue): string {
  if (value.changePercent === null) return 'No previous snapshot'
  const sign = value.changePercent > 0 ? '+' : ''
  return `${sign}${value.changePercent.toFixed(1)}% from previous snapshot`
}
function icon(value: KpiValue) {
  if (value.valueFormat === 'currency') return <BadgeDollarSign className="h-5 w-5" />
  if (value.valueFormat === 'percentage') return <Target className="h-5 w-5" />
  if (value.valueFormat === 'duration') return <Clock3 className="h-5 w-5" />
  if (value.category === 'telephony') return <PhoneCall className="h-5 w-5" />
  return <Activity className="h-5 w-5" />
}

export default async function KpisPage({ searchParams }: Props) {
  const params = await searchParams
  const period = periodValue(params.period)
  const overview = await getKpiOverview(period)
  const ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '1 year']] as const
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[.24em] text-cyan-400">Performance management</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">KPI engine</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Durable tenant-scoped performance snapshots for sales, telephony, and productivity metrics.</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="KPI period">
          {ranges.map(([value, label]) => <Link key={value} href={`/dashboard/kpis?period=${value}`} className={period === value ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white' : 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white'}>{label}</Link>)}
        </nav>
      </header>

      {overview.snapshot ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overview.snapshot.values.map((value) => <MetricCard key={value.key} label={value.name} value={format(value)} helper={helper(value)} icon={icon(value)} />)}
          </section>
          <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Snapshot details</h2>
                <p className="mt-1 text-sm text-slate-400">Captured {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(overview.snapshot.capturedAt))}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                {overview.snapshot.values.filter((item) => item.changePercent !== null && item.changePercent >= 0).length >= overview.snapshot.values.length / 2 ? <TrendingUp className="h-5 w-5 text-emerald-400" /> : <TrendingDown className="h-5 w-5 text-amber-400" />}
                {overview.history.length} retained snapshots
              </div>
            </div>
          </section>
        </>
      ) : <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-400">No KPI snapshot is available.</div>}
    </div>
  )
}

export const dynamic = 'force-dynamic'
