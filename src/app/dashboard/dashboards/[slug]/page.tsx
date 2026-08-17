import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, BarChart3 } from 'lucide-react'

import { requireFeature } from '@/lib/auth'
import { getDashboard } from '@/lib/dashboards'

type Props = {
  params: Promise<{ slug: string }>
}

const format = (value: number | string, kind?: string) => {
  if (typeof value === 'string') return value

  if (kind === 'percent') return `${value.toFixed(1)}%`
  if (kind === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (kind === 'duration') return `${Math.round(value)} sec`

  return new Intl.NumberFormat('en-US', {
    notation: value > 999 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

export default async function DashboardViewPage({ params }: Props) {
  await requireFeature('analytics.dashboards', 'reports.view')
  const { slug } = await params
  const { dashboard, metrics } = await getDashboard(slug)

  return (
    <div className="space-y-8 lg:relative lg:left-1/2 lg:w-[calc(100vw-328px)] lg:-translate-x-1/2">
      <header className="max-w-4xl">
        <Link
          href="/dashboard/dashboards"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          All dashboards
        </Link>
        <p className="mt-6 text-sm uppercase tracking-[.24em] text-cyan-400">
          {dashboard.kind} dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          {dashboard.name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {dashboard.description}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Loaded from the newest analytics snapshot available to this
          organization. Reloading this page requests the latest snapshot again.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-5">
        {dashboard.layout.map((widget) => {
          const content = (
            <>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-slate-300">
                  {widget.title}
                </p>
                <BarChart3 className="h-4 w-4 shrink-0 text-cyan-400" />
              </div>

              <p className="mt-4 text-3xl font-semibold text-white">
                {format(metrics[widget.metric] ?? 0, widget.format)}
              </p>

              {widget.description ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {widget.description}
                </p>
              ) : null}

              {widget.href ? (
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-cyan-300">
                  Open details
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              ) : null}
            </>
          )

          const className =
            'group col-span-12 flex flex-col rounded-2xl border border-white/10 bg-[#0B1726]/90 p-6 transition duration-200 sm:col-span-6 xl:col-span-3'
          const style = {
            minHeight: `${Math.max(widget.position.h, 1) * 110}px`,
          }

          if (widget.href) {
            return (
              <Link
                key={widget.id}
                href={widget.href}
                aria-label={`Open details for ${widget.title}`}
                className={`${className} hover:-translate-y-0.5 hover:border-cyan-400/45 hover:bg-white/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70`}
                style={style}
              >
                {content}
              </Link>
            )
          }

          return (
            <article key={widget.id} className={className} style={style}>
              {content}
            </article>
          )
        })}
      </section>
    </div>
  )
}

export const dynamic = 'force-dynamic'
