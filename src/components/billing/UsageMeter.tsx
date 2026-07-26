type UsageMeterProps = {
  label: string
  used: number
  limit: number | null
  formatter?: (value: number) => string
}

export function UsageMeter({ label, used, limit, formatter = (value) => value.toLocaleString() }: UsageMeterProps) {
  const percentage = limit === null || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const approachingLimit = limit !== null && percentage >= 80

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold text-white">{label}</p>
        <p className={`text-sm font-medium ${approachingLimit ? 'text-amber-300' : 'text-slate-300'}`}>
          {formatter(used)} / {limit === null ? 'Unlimited' : formatter(limit)}
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${approachingLimit ? 'bg-amber-400' : 'bg-cyan-400'}`} style={{ width: limit === null ? '0%' : `${percentage}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{limit === null ? 'No plan limit' : `${percentage}% used`}</p>
    </article>
  )
}
