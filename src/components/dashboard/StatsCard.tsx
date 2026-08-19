import Link from 'next/link'
import type { ReactNode } from 'react'

type StatsCardTone =
  | 'cyan'
  | 'blue'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose'

type StatsCardProps = {
  label: string
  value: string | number
  delta?: string
  icon: ReactNode
  trend?: string
  trendDirection?: 'up' | 'down' | 'neutral'
  progress?: number
  tone?: StatsCardTone
  href?: string
}

const toneStyles: Record<
  StatsCardTone,
  {
    icon: string
    glow: string
    progress: string
    badge: string
  }
> = {
  cyan: {
    icon: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    glow: 'from-cyan-400/15',
    progress: 'bg-cyan-400',
    badge: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  },
  blue: {
    icon: 'border-blue-400/20 bg-blue-400/10 text-blue-300',
    glow: 'from-blue-400/15',
    progress: 'bg-blue-400',
    badge: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
  },
  violet: {
    icon:
      'border-violet-400/20 bg-violet-400/10 text-violet-300',
    glow: 'from-violet-400/15',
    progress: 'bg-violet-400',
    badge:
      'border-violet-400/20 bg-violet-400/10 text-violet-200',
  },
  emerald: {
    icon:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    glow: 'from-emerald-400/15',
    progress: 'bg-emerald-400',
    badge:
      'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  },
  amber: {
    icon:
      'border-amber-400/20 bg-amber-400/10 text-amber-300',
    glow: 'from-amber-400/15',
    progress: 'bg-amber-400',
    badge:
      'border-amber-400/20 bg-amber-400/10 text-amber-200',
  },
  rose: {
    icon: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
    glow: 'from-rose-400/15',
    progress: 'bg-rose-400',
    badge: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
  },
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.min(Math.max(progress, 0), 100)
}

function getTrendStyles(
  direction: StatsCardProps['trendDirection'],
): string {
  if (direction === 'up') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  }

  if (direction === 'down') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  }

  return 'border-white/10 bg-white/5 text-slate-300'
}

function getTrendSymbol(
  direction: StatsCardProps['trendDirection'],
): string {
  if (direction === 'up') {
    return '↗'
  }

  if (direction === 'down') {
    return '↘'
  }

  return '•'
}

export default function StatsCard({
  label,
  value,
  delta,
  icon,
  trend,
  trendDirection = 'neutral',
  progress,
  tone = 'cyan',
  href,
}: StatsCardProps) {
  const selectedTone = toneStyles[tone]
  const normalizedProgress =
    progress === undefined
      ? undefined
      : normalizeProgress(progress)

  const card = (
    <article className="group relative h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1726]/92 p-5 shadow-[0_24px_70px_-48px_rgba(79,70,229,0.85)] transition duration-300 hover:-translate-y-0.5 hover:border-violet-400/20 hover:bg-[#0E1C2E]">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${selectedTone.glow} to-transparent opacity-70 transition duration-300 group-hover:opacity-100`}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-400">
              {label}
            </p>

            <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {value}
            </p>
          </div>

          <div
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-base font-semibold shadow-inner ${selectedTone.icon}`}
          >
            {icon}
          </div>
        </div>

        <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2">
          {trend ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getTrendStyles(
                trendDirection,
              )}`}
            >
              <span aria-hidden="true">
                {getTrendSymbol(trendDirection)}
              </span>
              {trend}
            </span>
          ) : null}

          {delta ? (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${selectedTone.badge}`}
            >
              {delta}
            </span>
          ) : null}
        </div>

        {normalizedProgress !== undefined ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>Progress</span>
              <span>{Math.round(normalizedProgress)}%</span>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all duration-700 ${selectedTone.progress}`}
                style={{
                  width: `${normalizedProgress}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )

  if (!href) return card

  return (
    <Link href={href} aria-label={`Open ${label}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
      {card}
    </Link>
  )
}