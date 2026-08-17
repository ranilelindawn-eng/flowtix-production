'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { assertEntitlement } from '@/lib/entitlements'
import {
  createSummary as createSummaryRecord,
  deleteSummary as deleteSummaryRecord,
  updateSummary as updateSummaryRecord,
} from '@/lib/summaries'

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getSummaryValues(formData: FormData) {
  return {
    transcriptId: getString(formData, 'transcript_id'),
    title: getString(formData, 'title'),
    summary: getString(formData, 'summary'),
    keyPoints: getString(formData, 'key_points'),
    actionItems: getString(formData, 'action_items'),
    sentiment: getString(formData, 'sentiment'),
    provider: getString(formData, 'provider'),
  }
}

export async function createSummary(formData: FormData) {
  const organization = await requirePermission('summaries.create')
  await assertEntitlement('ai.call_analysis', organization.organization_id)

  const summary = await createSummaryRecord(
    getSummaryValues(formData),
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/summaries')
  revalidatePath('/dashboard/transcripts')
  revalidatePath(
    `/dashboard/transcripts/${summary.transcript_id}`,
  )

  redirect(`/dashboard/summaries/${summary.id}`)
}

export async function updateSummary(formData: FormData) {
  const organization = await requirePermission('summaries.create')
  await assertEntitlement('ai.call_analysis', organization.organization_id)

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid summary ID is required.')
  }

  const summary = await updateSummaryRecord(
    id,
    getSummaryValues(formData),
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/summaries')
  revalidatePath(`/dashboard/summaries/${id}`)
  revalidatePath(
    `/dashboard/transcripts/${summary.transcript_id}`,
  )

  redirect(`/dashboard/summaries/${summary.id}`)
}

export async function deleteSummary(formData: FormData) {
  const organization = await requirePermission('summaries.create')
  await assertEntitlement('ai.call_analysis', organization.organization_id)

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid summary ID is required.')
  }

  await deleteSummaryRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/summaries')

  redirect('/dashboard/summaries')
}