'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import { assertEntitlement } from '@/lib/entitlements'
import {
  createTranscript as createTranscriptRecord,
  deleteTranscript as deleteTranscriptRecord,
  updateTranscript as updateTranscriptRecord,
} from '@/lib/transcripts'

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getTranscriptValues(formData: FormData) {
  return {
    recordingId: getString(formData, 'recording_id'),
    language: getString(formData, 'language'),
    content: getString(formData, 'content'),
    provider: getString(formData, 'provider'),
  }
}

export async function createTranscript(formData: FormData) {
  const organization = await requirePermission('transcripts.update')
  await assertEntitlement('ai.transcription', organization.organization_id)

  const transcript = await createTranscriptRecord(
    getTranscriptValues(formData),
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/transcripts')
  revalidatePath('/dashboard/recordings')
  revalidatePath(
    `/dashboard/recordings/${transcript.recording_id}`,
  )

  redirect(`/dashboard/transcripts/${transcript.id}`)
}

export async function updateTranscript(formData: FormData) {
  const organization = await requirePermission('transcripts.update')
  await assertEntitlement('ai.transcription', organization.organization_id)

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid transcript ID is required.')
  }

  const transcript = await updateTranscriptRecord(
    id,
    getTranscriptValues(formData),
  )

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/transcripts')
  revalidatePath(`/dashboard/transcripts/${id}`)
  revalidatePath(
    `/dashboard/recordings/${transcript.recording_id}`,
  )

  redirect(`/dashboard/transcripts/${transcript.id}`)
}

export async function deleteTranscript(formData: FormData) {
  const organization = await requirePermission('transcripts.update')
  await assertEntitlement('ai.transcription', organization.organization_id)

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid transcript ID is required.')
  }

  await deleteTranscriptRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/transcripts')

  redirect('/dashboard/transcripts')
}