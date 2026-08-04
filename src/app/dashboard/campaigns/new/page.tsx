import Link from 'next/link'

import { createCampaign } from '@/app/dashboard/campaigns/actions'
import CampaignForm from '@/components/campaigns/CampaignForm'
import { getAssignableMembers } from '@/lib/ownership'
import { getCurrentOrganization } from '@/lib/team'

export default async function NewCampaignPage() {
  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('Unable to determine the current organization.')
  const owners = await getAssignableMembers(membership)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-400">New campaign</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Create a campaign</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">Organize your outreach by creating a campaign with an owner, status, description, and optional schedule.</p>
        </div>
        <Link href="/dashboard/campaigns" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white">Back to campaigns</Link>
      </div>
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
        <CampaignForm owners={owners} action={createCampaign} submitLabel="Create campaign" />
      </section>
    </div>
  )
}
