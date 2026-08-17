import Link from 'next/link'
import { Activity, BrainCircuit, CheckCircle2, Clock3, Headphones, PhoneCall, Target, Users } from 'lucide-react'
import MetricCard from '@/components/reports/MetricCard'
import { requireFeature } from '@/lib/auth'
import AgentAnalyticsAutoRefresh from './AgentAnalyticsAutoRefresh'
import { getAgentAnalyticsOverview, normalizeAgentAnalyticsPeriod } from '@/lib/analytics/agents'

type Props = { searchParams: Promise<{ period?: string }> }

function percent(value: number): string { return `${value.toFixed(1)}%` }
function duration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds)); const hours = Math.floor(rounded / 3600); const minutes = Math.floor((rounded % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function AgentAnalyticsPage({ searchParams }: Props) {
  await requireFeature('analytics.agents', 'reports.view')
  const params = await searchParams
  const period = normalizeAgentAnalyticsPeriod(params.period)
  const { snapshot, history } = await getAgentAnalyticsOverview(period)
  const ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '1 year']] as const
  return <div className="space-y-8"><AgentAnalyticsAutoRefresh />
    <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm uppercase tracking-[.24em] text-cyan-400">Workforce intelligence</p><h1 className="mt-2 text-3xl font-semibold text-white">Agent analytics</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Measure agent availability, call performance, task execution, CRM activity, attendance utilization, coaching, and productivity from durable tenant-scoped snapshots.</p></div><nav className="flex flex-wrap gap-2" aria-label="Agent analytics period">{ranges.map(([value, label]) => <Link key={value} href={`/dashboard/agent-analytics?period=${value}`} className={period === value ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white' : 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white'}>{label}</Link>)}</nav></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active agents" value={snapshot.agents.filter((agent) => agent.onDuty).length.toLocaleString()} helper={`${snapshot.availableAgents} idle · ${snapshot.busyAgents} busy`} icon={<Users className="h-5 w-5" />} />
      <MetricCard label="Connect rate" value={percent(snapshot.connectRate)} helper={`${snapshot.connectedCalls} of ${snapshot.totalCalls} calls`} icon={<Headphones className="h-5 w-5" />} />
      <MetricCard label="Talk time" value={duration(snapshot.totalTalkSeconds)} helper={`${snapshot.totalCalls} total calls`} icon={<PhoneCall className="h-5 w-5" />} />
      <MetricCard label="Productivity" value={snapshot.averageProductivityScore.toFixed(1)} helper="Average composite score" icon={<Target className="h-5 w-5" />} />
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Completed tasks" value={snapshot.completedTasks.toLocaleString()} helper={`${snapshot.overdueTasks} overdue`} icon={<CheckCircle2 className="h-5 w-5" />} />
      <MetricCard label="CRM activities" value={snapshot.completedActivities.toLocaleString()} helper="Completed activity records" icon={<Activity className="h-5 w-5" />} />
      <MetricCard label="Attendance" value={duration(snapshot.attendanceSeconds)} helper={snapshot.metadata.attendanceAccessible === false ? 'Limited by attendance visibility' : 'Visible shift time'} icon={<Clock3 className="h-5 w-5" />} />
      <MetricCard label="Coaching score" value={snapshot.averageCoachingScore == null ? 'No data' : snapshot.averageCoachingScore.toFixed(1)} helper={`${history.length} retained snapshots`} icon={<BrainCircuit className="h-5 w-5" />} />
    </section>
    <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6"><h2 className="text-lg font-semibold text-white">Agent leaderboard</h2><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[.15em] text-slate-500"><tr><th className="pb-3">Agent</th><th className="pb-3">Presence</th><th className="pb-3">Calls</th><th className="pb-3">Connect</th><th className="pb-3">Talk time</th><th className="pb-3">Tasks</th><th className="pb-3">Activities</th><th className="pb-3">Coaching</th><th className="pb-3">Score</th></tr></thead><tbody className="divide-y divide-white/5">{snapshot.agents.map((agent) => <tr key={agent.membershipId}><td className="py-3"><p className="font-medium text-white">{agent.name}</p><p className="text-xs capitalize text-slate-500">{agent.role}</p></td><td className="py-3 text-slate-300"><span>{agent.onDuty ? 'Active' : 'Offline'}</span><span className="text-slate-600"> / </span><span className="capitalize">{agent.activityState.replaceAll('_', ' ')}</span></td><td className="py-3 text-slate-300">{agent.totalCalls}</td><td className="py-3 text-cyan-300">{percent(agent.connectRate)}</td><td className="py-3 text-slate-300">{duration(agent.talkSeconds)}</td><td className="py-3 text-slate-300">{agent.completedTasks}/{agent.assignedTasks}</td><td className="py-3 text-slate-300">{agent.completedActivities}</td><td className="py-3 text-slate-300">{agent.coachingScore == null ? '—' : agent.coachingScore.toFixed(1)}</td><td className="py-3 font-semibold text-white">{agent.productivityScore.toFixed(1)}</td></tr>)}</tbody></table></div></section>
  </div>
}

export const dynamic = 'force-dynamic'
