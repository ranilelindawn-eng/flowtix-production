'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { assertEntitlement } from '@/lib/entitlements'
import {
  createInsight as createInsightRecord,
  deleteInsight as deleteInsightRecord,
  updateInsight as updateInsightRecord,
} from '@/lib/insights'

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getNumber(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getInsightValues(formData: FormData) {
  return {
    transcriptId: getString(formData, 'transcript_id'),
    summaryId: getString(formData, 'summary_id'),
    sentiment: getString(formData, 'sentiment'),
    talkRatio: getNumber(formData, 'talk_ratio'),
    objectionCount: getNumber(formData, 'objection_count'),
    keywordCount: getNumber(formData, 'keyword_count'),
    recommendation: getString(formData, 'recommendation'),
    provider: getString(formData, 'provider'),
  }
}

export async function createInsight(formData: FormData) {
  const organization = await requirePermission('insights.view')
  await assertEntitlement('ai.insights', organization.organization_id)
  const insight = await createInsightRecord(
    getInsightValues(formData)
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/insights')
  revalidatePath('/dashboard/transcripts')
  revalidatePath('/dashboard/summaries')

  redirect(`/dashboard/insights/${insight.id}`)
}

export async function updateInsight(formData: FormData) {
  const organization = await requirePermission('insights.view')
  await assertEntitlement('ai.insights', organization.organization_id)
  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid insight ID is required.')
  }

  const insight = await updateInsightRecord(
    id,
    getInsightValues(formData)
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/insights')
  revalidatePath(`/dashboard/insights/${id}`)
  revalidatePath(`/dashboard/transcripts/${insight.transcript_id}`)

  if (insight.summary_id) {
    revalidatePath(`/dashboard/summaries/${insight.summary_id}`)
  }

  redirect(`/dashboard/insights/${insight.id}`)
}

export async function deleteInsight(formData: FormData) {
  const organization = await requirePermission('insights.view')
  await assertEntitlement('ai.insights', organization.organization_id)
  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid insight ID is required.')
  }

  await deleteInsightRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/insights')

  redirect('/dashboard/insights')
}