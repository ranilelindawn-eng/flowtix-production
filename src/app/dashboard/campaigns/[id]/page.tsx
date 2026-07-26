import Link from 'next/link'
import { notFound } from 'next/navigation'
import DeleteCampaignButton from '@/components/campaigns/DeleteCampaignButton'

import { getCampaign, type CampaignStatus } from '@/lib/campaigns'

type CampaignPageProps = {
  params: Promise<{
    id: string
  }>
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getStatusClasses(status: CampaignStatus): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'paused':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'

    case 'completed':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-400'

    case 'draft':
    default:
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

export default async function CampaignPage({
  params,
}: CampaignPageProps) {
  const { id } = await params
  const campaign = await getCampaign(id)

  if (!campaign) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">
            Campaign details
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {campaign.name}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review campaign information, status, and schedule.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard/campaigns"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
          >
            Back to campaigns
          </Link>

          <Link
            href={`/dashboard/campaigns/${id}/edit`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Edit campaign
          </Link>
          <DeleteCampaignButton
  campaignId={id}
  campaignName={campaign.name}
/>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Campaign information
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Core details for this outreach campaign.
              </p>
            </div>

            <span
              className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                campaign.status
              )}`}
            >
              {campaign.status}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="space-y-6 p-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Campaign name
              </dt>

              <dd className="mt-2 text-base font-medium text-white">
                {campaign.name}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description
              </dt>

              <dd className="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-200">
                {campaign.description || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </dt>

              <dd className="mt-2 text-base capitalize text-slate-200">
                {campaign.status}
              </dd>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Start date
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDate(campaign.start_date)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                End date
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDate(campaign.end_date)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Created
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDateTime(campaign.created_at)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Last updated
              </dt>

              <dd className="mt-2 text-base text-slate-200">
                {formatDateTime(campaign.updated_at)}
              </dd>
            </div>
          </div>
        </dl>
      </section>
    </div>
  )
}