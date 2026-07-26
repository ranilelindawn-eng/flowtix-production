import type {
  CampaignMemberStatus,
} from '@/lib/campaign-members'

type CampaignMemberStatusBadgeProps = {
  status: CampaignMemberStatus
  className?: string
}

function getStatusClasses(
  status: CampaignMemberStatus,
): string {
  switch (status) {
    case 'pending':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'

    case 'calling':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'

    case 'completed':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'failed':
      return 'border-red-500/20 bg-red-500/10 text-red-400'

    case 'skipped':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'
  }
}

function getStatusLabel(
  status: CampaignMemberStatus,
): string {
  switch (status) {
    case 'pending':
      return 'Pending'

    case 'calling':
      return 'Calling'

    case 'completed':
      return 'Completed'

    case 'failed':
      return 'Failed'

    case 'skipped':
      return 'Skipped'
  }
}

export default function CampaignMemberStatusBadge({
  status,
  className = '',
}: CampaignMemberStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
        status,
      )} ${className}`}
    >
      {getStatusLabel(status)}
    </span>
  )
}