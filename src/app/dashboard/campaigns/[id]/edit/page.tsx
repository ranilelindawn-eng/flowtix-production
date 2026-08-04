import Link from 'next/link'
import { notFound } from 'next/navigation'

import CampaignForm from '@/components/campaigns/CampaignForm'
import { getCampaign } from '@/lib/campaigns'
import { getAssignableMembers } from '@/lib/ownership'
import { getCurrentOrganization } from '@/lib/team'
import { updateCampaign } from '@/app/dashboard/campaigns/actions'

type EditCampaignPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditCampaignPage({
  params,
}: EditCampaignPageProps) {
  const { id } = await params

  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('Unable to determine the current organization.')
  const [campaign, owners] = await Promise.all([
    getCampaign(id),
    getAssignableMembers(membership),
  ])

  if (!campaign) {
    notFound()
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-cyan-400">
            Edit campaign
          </p>

          <h1 className="mt-3 text-3xl font-semibold text-white">
            Update {campaign.name}
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Modify campaign information while preserving your organization
            records.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/campaigns"
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to campaigns
          </Link>

          <Link
            href={`/dashboard/campaigns/${campaign.id}`}
            className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            View campaign
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 p-6 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <CampaignForm
          initialValues={campaign}
          owners={owners}
          hiddenId={campaign.id}
          action={updateCampaign}
          submitLabel="Save changes"
        />
      </div>
    </div>
  )
}