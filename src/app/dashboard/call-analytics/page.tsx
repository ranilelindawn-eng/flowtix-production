import Link from 'next/link'
import {
  Activity,
  Clock3,
  Headphones,
  PhoneCall,
  PhoneMissed,
  PhoneOutgoing,
  Voicemail,
} from 'lucide-react'

import MetricCard from '@/components/reports/MetricCard'
import {
  getCallAnalyticsOverview,
  normalizeCallAnalyticsPeriod,
} from '@/lib/analytics/calls'
import { getCurrentOrganizationTimezone } from '@/lib/team'

type Props = { searchParams: Promise<{ period?: string }> }

function percent(value: number): string {
  return `${value.toFixed(1)}%`
}

function duration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remaining = rounded % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${remaining}s`
  return `${remaining}s`
}

export default async function CallAnalyticsPage({ searchParams }: Props) {
  const timeZone = await getCurrentOrganizationTimezone()
  const params = await searchParams
  const period = normalizeCallAnalyticsPeriod(params.period)
  const { snapshot, history } = await getCallAnalyticsOverview(period)
  const ranges = [
    ['7d', '7 days'],
    ['30d', '30 days'],
    ['90d', '90 days'],
    ['365d', '1 year'],
  ] as const

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
            Conversation intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Call analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Analyze outbound call volume, connectivity, talk time, recordings,
            providers, and agent execution from durable tenant-scoped snapshots.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Call analytics period">
          {ranges.map(([value, label]) => (
            <Link
              key={value}
              href={`/dashboard/call-analytics?period=${value}`}
              className={
                period === value
                  ? 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white'
                  : 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white'
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Outbound calls"
          value={snapshot.outboundCalls.toLocaleString()}
          helper="Flowtix outbound activity"
          icon={<PhoneOutgoing className="h-5 w-5" />}
        />
        <MetricCard
          label="Connect rate"
          value={percent(snapshot.connectRate)}
          helper={`${snapshot.connectedCalls} connected`}
          icon={<Headphones className="h-5 w-5" />}
        />
        <MetricCard
          label="Average duration"
          value={duration(snapshot.averageDurationSeconds)}
          helper={`${duration(snapshot.totalTalkSeconds)} total talk time`}
          icon={<Clock3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Missed / no answer"
          value={snapshot.missedCalls.toLocaleString()}
          helper={`${snapshot.failedCalls} failed outcomes`}
          icon={<PhoneMissed className="h-5 w-5" />}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Connected calls"
          value={snapshot.connectedCalls.toLocaleString()}
          helper="Completed conversations"
          icon={<PhoneCall className="h-5 w-5" />}
        />
        <MetricCard
          label="Recording rate"
          value={percent(snapshot.recordingRate)}
          helper={`${snapshot.recordedCalls} recorded calls`}
          icon={<Voicemail className="h-5 w-5" />}
        />
        <MetricCard
          label="Failed calls"
          value={snapshot.failedCalls.toLocaleString()}
          helper="Outbound failures"
          icon={<PhoneMissed className="h-5 w-5" />}
        />
        <MetricCard
          label="Snapshots"
          value={history.length.toLocaleString()}
          helper={`Captured ${new Date(snapshot.capturedAt).toLocaleString('en-US', { timeZone })}`}
          icon={<Activity className="h-5 w-5" />}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6">
        <h2 className="text-lg font-semibold text-white">Provider performance</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {snapshot.providers.map((provider) => (
            <div
              key={provider.provider}
              className="rounded-xl border border-white/5 bg-white/[.03] p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="capitalize font-medium text-white">{provider.provider}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {provider.totalCalls} calls · {provider.failedCalls} failed
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-cyan-300">
                    {percent(provider.connectRate)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {duration(provider.averageDurationSeconds)} average
                  </p>
                </div>
              </div>
            </div>
          ))}
          {snapshot.providers.length === 0 ? (
            <p className="text-sm text-slate-400">No outbound provider activity yet.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6">
        <h2 className="text-lg font-semibold text-white">Agent performance</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[.15em] text-slate-500">
              <tr>
                <th className="pb-3">Agent</th>
                <th className="pb-3">Calls</th>
                <th className="pb-3">Connected</th>
                <th className="pb-3">Connect rate</th>
                <th className="pb-3">Talk time</th>
                <th className="pb-3">Avg. duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {snapshot.agents.slice(0, 20).map((agent) => (
                <tr key={agent.membershipId ?? agent.userId ?? agent.name}>
                  <td className="py-3 font-medium text-white">{agent.name}</td>
                  <td className="py-3 text-slate-300">{agent.totalCalls}</td>
                  <td className="py-3 text-slate-300">{agent.connectedCalls}</td>
                  <td className="py-3 text-cyan-300">{percent(agent.connectRate)}</td>
                  <td className="py-3 text-slate-300">{duration(agent.totalTalkSeconds)}</td>
                  <td className="py-3 text-slate-300">{duration(agent.averageDurationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
