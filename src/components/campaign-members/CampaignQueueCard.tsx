'use client'

import {
  CheckCircle2,
  Clock3,
  PhoneCall,
  SkipForward,
  XCircle,
} from 'lucide-react'

type CampaignQueueStats = {
  pending: number
  calling: number
  completed: number
  failed: number
  skipped: number
}

type CampaignQueueCardProps = {
  stats: CampaignQueueStats
  className?: string
}

function QueueItem({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-xl ${color}`}
        >
          {icon}
        </div>

        <div>
          <p className="text-sm font-medium text-white">
            {label}
          </p>

          <p className="text-xs text-slate-500">
            Campaign members
          </p>
        </div>
      </div>

      <span className="text-lg font-bold text-white">
        {value}
      </span>
    </div>
  )
}

export default function CampaignQueueCard({
  stats,
  className = '',
}: CampaignQueueCardProps) {
  const total =
    stats.pending +
    stats.calling +
    stats.completed +
    stats.failed +
    stats.skipped

  return (
    <section
      className={`rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)] ${className}`}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Campaign Queue
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Real-time queue overview
          </p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Total
          </p>

          <p className="text-xl font-bold text-white">
            {total}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <QueueItem
          label="Pending"
          value={stats.pending}
          icon={<Clock3 className="size-5 text-slate-300" />}
          color="bg-slate-500/10"
        />

        <QueueItem
          label="Calling"
          value={stats.calling}
          icon={<PhoneCall className="size-5 text-cyan-400" />}
          color="bg-cyan-500/10"
        />

        <QueueItem
          label="Completed"
          value={stats.completed}
          icon={<CheckCircle2 className="size-5 text-emerald-400" />}
          color="bg-emerald-500/10"
        />

        <QueueItem
          label="Failed"
          value={stats.failed}
          icon={<XCircle className="size-5 text-red-400" />}
          color="bg-red-500/10"
        />

        <QueueItem
          label="Skipped"
          value={stats.skipped}
          icon={<SkipForward className="size-5 text-amber-400" />}
          color="bg-amber-500/10"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-400">
            Completion Progress
          </span>

          <span className="font-semibold text-white">
            {total === 0
              ? 0
              : Math.round(
                  (stats.completed / total) * 100,
                )}
            %
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
            style={{
              width: `${
                total === 0
                  ? 0
                  : (stats.completed / total) * 100
              }%`,
            }}
          />
        </div>
      </div>
    </section>
  )
}