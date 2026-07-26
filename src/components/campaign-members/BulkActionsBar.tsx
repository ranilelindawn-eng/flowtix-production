'use client'

import { Trash2, RotateCcw, SkipForward, PhoneCall } from 'lucide-react'

type BulkActionsBarProps = {
  selectedCount: number
  onRetry?: () => void
  onSkip?: () => void
  onReset?: () => void
  onRemove?: () => void
  className?: string
}

function ActionButton({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition
      ${
        destructive
          ? 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }
      disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {icon}
      {label}
    </button>
  )
}

export default function BulkActionsBar({
  selectedCount,
  onRetry,
  onSkip,
  onReset,
  onRemove,
  className = '',
}: BulkActionsBarProps) {
  if (selectedCount === 0) {
    return null
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5 md:flex-row md:items-center md:justify-between ${className}`}
    >
      <div>
        <h3 className="font-semibold text-white">
          {selectedCount} contact{selectedCount > 1 ? 's' : ''} selected
        </h3>

        <p className="mt-1 text-sm text-slate-400">
          Perform bulk actions on the selected campaign members.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton
          icon={<PhoneCall className="size-4" />}
          label="Retry"
          onClick={onRetry}
        />

        <ActionButton
          icon={<SkipForward className="size-4" />}
          label="Skip"
          onClick={onSkip}
        />

        <ActionButton
          icon={<RotateCcw className="size-4" />}
          label="Reset"
          onClick={onReset}
        />

        <ActionButton
          icon={<Trash2 className="size-4" />}
          label="Remove"
          onClick={onRemove}
          destructive
        />
      </div>
    </div>
  )
}