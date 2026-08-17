import Link from 'next/link'
import {
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  Megaphone,
  PhoneCall,
  Settings2,
  TrendingUp,
  UserRoundCheck,
  Workflow,
} from 'lucide-react'

import { requireFeature } from '@/lib/auth'
import { listDashboards } from '@/lib/dashboards'

const icons = {
  executive: BarChart3,
  sales: TrendingUp,
  agent: UserRoundCheck,
  campaign: Megaphone,
  ai: BrainCircuit,
  operations: Workflow,
  telephony: PhoneCall,
  custom: Settings2,
}

export default async function DashboardsPage() {
  await requireFeature('analytics.dashboards', 'reports.view')
  const dashboards = await listDashboards()

  return (
    <div className="space-y-8 lg:relative lg:left-1/2 lg:w-[calc(100vw-328px)] lg:-translate-x-1/2">
      <header className="max-w-4xl">
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Reporting workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Dashboards</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Role-aware executive, sales, agent, campaign, AI, operations, and
          telephony dashboards backed by the latest tenant-scoped analytics
          snapshots available to your workspace.
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {dashboards.map((dashboard) => {
          const Icon = icons[dashboard.kind]

          return (
            <Link
              key={dashboard.id}
              href={`/dashboard/dashboards/${dashboard.slug}`}
              aria-label={`Open ${dashboard.name}`}
              className="group flex min-h-[220px] flex-col rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/45 hover:bg-white/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-slate-400">
                  {dashboard.kind}
                </span>
              </div>

              <h2 className="mt-5 text-lg font-semibold text-white transition group-hover:text-cyan-100">
                {dashboard.name}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">
                {dashboard.description}
              </p>

              <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-white/5 pt-4">
                <p className="text-xs leading-5 text-slate-500">
                  {dashboard.layout.length} configured widgets ·{' '}
                  {dashboard.allowedRoles.join(', ')}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300">
                  Open dashboard
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Link>
          )
        })}
      </section>

      {dashboards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#0B1726]/70 p-10 text-center">
          <p className="text-sm text-slate-400">
            No dashboards are available for your current workspace role.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export const dynamic = 'force-dynamic'
