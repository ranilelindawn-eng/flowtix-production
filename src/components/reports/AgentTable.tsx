import type { AgentPerformance } from '@/lib/reports'

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export default function AgentTable({ agents }: { agents: AgentPerformance[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B1726]/90">
      <div className="border-b border-white/10 p-5">
        <h2 className="text-lg font-semibold text-white">Agent and team performance</h2>
        <p className="mt-1 text-sm text-slate-400">Calls, activity, conversion, and revenue by team member.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-4">Agent</th><th className="px-4 py-4">Calls</th><th className="px-4 py-4">Connected</th><th className="px-4 py-4">Talk time</th><th className="px-4 py-4">Activities</th><th className="px-4 py-4">Won</th><th className="px-4 py-4">Conversion</th><th className="px-5 py-4 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {agents.map((agent) => (
              <tr key={agent.userId} className="transition hover:bg-white/[0.025]">
                <td className="px-5 py-4"><p className="font-medium text-white">{agent.name}</p><p className="mt-1 text-xs text-slate-500">{agent.email || agent.role}</p></td>
                <td className="px-4 py-4 text-slate-300">{agent.calls}</td><td className="px-4 py-4 text-slate-300">{agent.connectedCalls}</td><td className="px-4 py-4 text-slate-300">{formatDuration(agent.talkSeconds)}</td><td className="px-4 py-4 text-slate-300">{agent.activities}</td><td className="px-4 py-4 text-slate-300">{agent.wonDeals}</td><td className="px-4 py-4 text-slate-300">{agent.conversionRate.toFixed(1)}%</td><td className="px-5 py-4 text-right font-medium text-cyan-300">{formatCurrency(agent.revenue)}</td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500">No team activity is available for this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
