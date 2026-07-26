'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import {
  createCampaign as createCampaignRecord,
  deleteCampaign as deleteCampaignRecord,
  updateCampaign as updateCampaignRecord,
  type CampaignFormValues,
  type CampaignStatus,
} from '@/lib/campaigns'

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'draft',
  'active',
  'paused',
  'completed',
]

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getCampaignStatus(formData: FormData): CampaignStatus {
  const value = getString(formData, 'status')

  if (CAMPAIGN_STATUSES.includes(value as CampaignStatus)) {
    return value as CampaignStatus
  }

  return 'draft'
}

function getCampaignValues(formData: FormData): CampaignFormValues {
  return {
    name: getString(formData, 'name'),
    description: getString(formData, 'description'),
    status: getCampaignStatus(formData),
    start_date: getString(formData, 'start_date'),
    end_date: getString(formData, 'end_date'),
  }
}

export async function createCampaign(formData: FormData) {
  await requirePermission('campaigns.create')

  const values = getCampaignValues(formData)

  if (!values.name) {
    throw new Error('Campaign name is required.')
  }

  const campaign = await createCampaignRecord(values)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/campaigns')

  redirect(`/dashboard/campaigns/${campaign.id}`)
}

export async function updateCampaign(formData: FormData) {
  await requirePermission('campaigns.update')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid campaign ID is required.')
  }

  const values = getCampaignValues(formData)

  if (!values.name) {
    throw new Error('Campaign name is required.')
  }

  await updateCampaignRecord(id, values)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/campaigns')
  revalidatePath(`/dashboard/campaigns/${id}`)
  revalidatePath(`/dashboard/campaigns/${id}/edit`)

  redirect(`/dashboard/campaigns/${id}`)
}

export async function deleteCampaign(formData: FormData) {
  await requirePermission('campaigns.delete')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid campaign ID is required.')
  }

  await deleteCampaignRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/campaigns')

  redirect('/dashboard/campaigns')
}