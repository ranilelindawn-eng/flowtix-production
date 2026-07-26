import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'

import type {
  Campaign,
  CampaignStatus,
} from '@/lib/campaigns'

type CampaignTableProps = {
  campaigns: Campaign[]
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function getStatusClasses(
  status: CampaignStatus,
): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'paused':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'

    case 'completed':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-400'

    case 'draft':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

export default function CampaignTable({
  campaigns,
}: CampaignTableProps) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 px-6 py-16 text-center shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-xl font-semibold text-blue-400">
          +
        </div>

        <h2 className="mt-4 text-lg font-semibold text-white">
          No campaigns found
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Create your first campaign or change your search and filter settings
          to view matching campaigns.
        </p>

        <Link
          href="/dashboard/campaigns/new"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Create campaign
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[950px] w-full table-auto text-left text-sm">
          <thead className="border-b border-white/10 bg-[#07111F]/80 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-semibold">
                Campaign
              </th>

              <th className="px-6 py-4 font-semibold">
                Status
              </th>

              <th className="px-6 py-4 font-semibold">
                Start date
              </th>

              <th className="px-6 py-4 font-semibold">
                End date
              </th>

              <th className="px-6 py-4 font-semibold">
                Created
              </th>

              <th className="px-6 py-4 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5 text-slate-300">
            {campaigns.map((campaign) => (
              <tr
                key={campaign.id}
                className="transition hover:bg-white/[0.03]"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}`}
                    className="font-medium text-white transition hover:text-cyan-300"
                  >
                    {campaign.name}
                  </Link>

                  <p className="mt-1 max-w-md truncate text-xs text-slate-500">
                    {campaign.description || 'No description'}
                  </p>
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                      campaign.status,
                    )}`}
                  >
                    {campaign.status}
                  </span>
                </td>

                <td className="px-6 py-4 text-slate-300">
                  {formatDate(campaign.start_date)}
                </td>

                <td className="px-6 py-4 text-slate-300">
                  {formatDate(campaign.end_date)}
                </td>

                <td className="px-6 py-4 text-slate-400">
                  {formatDate(campaign.created_at)}
                </td>

                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}/edit`}
                    aria-label={`Edit ${campaign.name}`}
                    title={`Edit ${campaign.name}`}
                    className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <MoreHorizontal
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-white/10 md:hidden">
        {campaigns.map((campaign) => (
          <article
            key={campaign.id}
            className="p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="block truncate font-semibold text-white transition hover:text-cyan-300"
                >
                  {campaign.name}
                </Link>

                <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                  {campaign.description || 'No description'}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                  campaign.status,
                )}`}
              >
                {campaign.status}
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">
                  Start date
                </dt>

                <dd className="mt-1 text-slate-200">
                  {formatDate(campaign.start_date)}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  End date
                </dt>

                <dd className="mt-1 text-slate-200">
                  {formatDate(campaign.end_date)}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Created
                </dt>

                <dd className="mt-1 text-slate-200">
                  {formatDate(campaign.created_at)}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Status
                </dt>

                <dd className="mt-1 capitalize text-slate-200">
                  {campaign.status}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex items-center gap-4">
              <Link
                href={`/dashboard/campaigns/${campaign.id}`}
                className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                View campaign
              </Link>

              <Link
                href={`/dashboard/campaigns/${campaign.id}/edit`}
                className="text-sm font-medium text-slate-400 transition hover:text-white"
              >
                Edit
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}