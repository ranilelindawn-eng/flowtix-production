'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'
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
    owner_membership_id: getString(formData, 'owner_membership_id'),
  }
}

export async function createCampaign(
  previousState: { status: 'idle' | 'error'; message: string },
  formData: FormData,
) {
  void previousState
  let campaign: Awaited<ReturnType<typeof createCampaignRecord>>

  try {
    await requirePermission('campaigns.create')

    const values = getCampaignValues(formData)

    if (!values.name) {
      return {
        status: 'error' as const,
        message: 'Campaign name is required.',
      }
    }

    campaign = await createCampaignRecord(values)
  } catch (error) {
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(error, {
        context: 'campaign',
      }),
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/campaigns')

  redirect(`/dashboard/campaigns/${campaign.id}`)
}

export async function updateCampaign(
  previousState: { status: 'idle' | 'error'; message: string },
  formData: FormData,
) {
  void previousState
  const id = getString(formData, 'id')

  if (!id) {
    return {
      status: 'error' as const,
      message: 'A valid campaign ID is required.',
    }
  }

  try {
    await requirePermission('campaigns.update')

    const values = getCampaignValues(formData)

    if (!values.name) {
      return {
        status: 'error' as const,
        message: 'Campaign name is required.',
      }
    }

    await updateCampaignRecord(id, values)
  } catch (error) {
    return {
      status: 'error' as const,
      message: getUserFacingErrorMessage(error, {
        context: 'campaign',
      }),
    }
  }

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