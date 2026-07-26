import type { DailyMetric } from '@/lib/reports'

type TrendChartProps = {
  data: DailyMetric[]
  metric: 'calls' | 'activities' | 'revenue'
  title: string
  formatter?: (value: number) => string
}

export default function TrendChart({ data, metric, title, formatter = String }: TrendChartProps) {
  const values = data.map((item) => item[metric])
  const max = Math.max(...values, 1)
  const compact = data.length > 31
  const visibleLabels = compact ? 6 : Math.min(data.length, 8)

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-500">Daily totals for the selected reporting period</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          Peak {formatter(max)}
        </span>
      </div>
      <div className="mt-6 flex h-52 items-end gap-1" aria-label={`${title} bar chart`}>
        {data.map((item, index) => {
          const height = item[metric] === 0 ? 2 : Math.max(4, (item[metric] / max) * 100)
          const shouldLabel = index % Math.max(1, Math.floor(data.length / visibleLabels)) === 0
          return (
            <div key={item.date} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end">
              <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded-lg border border-white/10 bg-[#07111F] px-2 py-1 text-xs text-white shadow-xl group-hover:block">
                {item.label}: {formatter(item[metric])}
              </div>
              <div
                className="w-full rounded-t bg-gradient-to-t from-blue-600 to-cyan-300 transition-opacity group-hover:opacity-80"
                style={{ height: `${height}%` }}
              />
              <span className="mt-2 h-4 truncate text-[10px] text-slate-600">
                {shouldLabel ? item.label : ''}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
