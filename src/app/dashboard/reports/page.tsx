import Link from 'next/link'
import { Activity, BadgeDollarSign, ChartNoAxesCombined, CircleDollarSign, PhoneCall, Target, Users } from 'lucide-react'
import ActivityBreakdown from '@/components/reports/ActivityBreakdown'
import AgentTable from '@/components/reports/AgentTable'
import MetricCard from '@/components/reports/MetricCard'
import TrendChart from '@/components/reports/TrendChart'
import { getReportsData, normalizeReportRange } from '@/lib/reports'

type ReportsPageProps = {
  searchParams: Promise<{ range?: string }>
}

function currency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams
  const range = normalizeReportRange(params.range)
  const report = await getReportsData(range)
  const ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '1 year']] as const
  const connectRate = report.totalCalls > 0 ? (report.connectedCalls / report.totalCalls) * 100 : 0

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[.24em] text-cyan-400">Business intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Reports & analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Monitor sales, calls, agents, conversion, revenue, activities, and team performance from one tenant-safe dashboard.</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Report period">
          {ranges.map(([value, label]) => <Link key={value} href={`/dashboard/reports?range=${value}`} className={range === value ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white' : 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white'}>{label}</Link>)}
        </nav>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Won revenue" value={currency(report.totalRevenue)} helper={`${report.wonDeals} won deals`} icon={<BadgeDollarSign className="h-5 w-5" />} />
        <MetricCard label="Open pipeline" value={currency(report.pipelineValue)} helper={`${currency(report.weightedPipelineValue)} weighted`} icon={<CircleDollarSign className="h-5 w-5" />} />
        <MetricCard label="Conversion rate" value={`${report.conversionRate.toFixed(1)}%`} helper={`${report.wonDeals} won · ${report.lostDeals} lost`} icon={<Target className="h-5 w-5" />} />
        <MetricCard label="Team members" value={report.agents.length.toLocaleString()} helper={`${report.openDeals} open opportunities`} icon={<Users className="h-5 w-5" />} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total calls" value={report.totalCalls.toLocaleString()} helper={`${report.connectedCalls} connected`} icon={<PhoneCall className="h-5 w-5" />} />
        <MetricCard label="Connect rate" value={`${connectRate.toFixed(1)}%`} helper={`${report.missedCalls} missed or failed`} icon={<ChartNoAxesCombined className="h-5 w-5" />} />
        <MetricCard label="Average duration" value={duration(report.averageCallSeconds)} helper={`${duration(report.totalTalkSeconds)} total talk time`} icon={<Activity className="h-5 w-5" />} />
        <MetricCard label="Activities" value={(report.activity.calls + report.activity.notes + report.activity.tasks + report.activity.emails + report.activity.sms + report.activity.comments).toLocaleString()} helper={`${report.activity.completedTasks} completed tasks`} icon={<Activity className="h-5 w-5" />} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <TrendChart data={report.daily} metric="revenue" title="Revenue trend" formatter={currency} />
        <TrendChart data={report.daily} metric="calls" title="Call volume" formatter={(value) => value.toLocaleString()} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <TrendChart data={report.daily} metric="activities" title="Sales activities" formatter={(value) => value.toLocaleString()} />
        <ActivityBreakdown data={report.activity} />
      </div>

      <AgentTable agents={report.agents} />
    </div>
  )
}

export const dynamic = 'force-dynamic'
