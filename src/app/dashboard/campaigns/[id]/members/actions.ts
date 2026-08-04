'use server'

import { revalidatePath } from 'next/cache'

import { requireFeature } from '@/lib/auth'
import { scheduleCampaignMembers } from '@/lib/campaigns/engine'

export async function queueCampaignMembersAction(
  formData: FormData,
): Promise<void> {
  await requireFeature(
    'automation.campaigns',
    'campaigns.update',
  )

  const campaignId = String(
    formData.get('campaignId') ?? '',
  ).trim()

  if (!campaignId) {
    throw new Error('A valid campaign ID is required.')
  }

  await scheduleCampaignMembers({
    campaignId,
    limit: 25,
    leaseSeconds: 900,
  })

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  revalidatePath(
    `/dashboard/campaigns/${campaignId}/members`,
  )
  revalidatePath('/dashboard/settings/jobs')
}
