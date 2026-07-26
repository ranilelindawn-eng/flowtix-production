type ActivityCardProps = {
  title: string
  description: string
  time: string
}

export default function ActivityCard({ title, description, time }: ActivityCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-5 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-400">{time}</span>
      </div>
    </div>
  )
}
