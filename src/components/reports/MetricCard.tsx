import type { ReactNode } from 'react'

type MetricCardProps = {
  label: string
  value: string
  helper: string
  icon: ReactNode
}

export default function MetricCard({ label, value, helper, icon }: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 shadow-[0_20px_60px_-40px_rgba(34,211,238,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{helper}</p>
        </div>
        <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">{icon}</div>
      </div>
    </article>
  )
}
