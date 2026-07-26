import type { ActivityBreakdown as ActivityData } from '@/lib/reports'

type Props = { data: ActivityData }

export default function ActivityBreakdown({ data }: Props) {
  const items = [
    ['Calls', data.calls],
    ['Notes', data.notes],
    ['Tasks', data.tasks],
    ['Completed tasks', data.completedTasks],
    ['Emails', data.emails],
    ['SMS', data.sms],
    ['Internal comments', data.comments],
  ] as const
  const max = Math.max(...items.map(([, value]) => value), 1)

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
      <h2 className="text-lg font-semibold text-white">Activity mix</h2>
      <p className="mt-1 text-sm text-slate-400">How your team engaged during the selected period.</p>
      <div className="mt-6 space-y-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-300">{label}</span>
              <span className="font-medium text-white">{value.toLocaleString()}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300" style={{ width: `${Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
