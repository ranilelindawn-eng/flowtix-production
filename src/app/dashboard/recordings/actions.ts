'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import {
  deleteRecording as deleteRecordingRecord,
  uploadRecording as uploadRecordingRecord,
} from '@/lib/recordings'

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getFile(formData: FormData, key: string): File {
  const value = formData.get(key)

  if (!(value instanceof File)) {
    throw new Error('A valid recording file is required.')
  }

  return value
}

function getOptionalDuration(formData: FormData): number | null {
  const value = getString(formData, 'duration_seconds')

  if (!value) {
    return null
  }

  const duration = Number(value)

  if (!Number.isInteger(duration) || duration < 0) {
    throw new Error(
      'Recording duration must be a whole number greater than or equal to zero.',
    )
  }

  return duration
}

export async function uploadRecording(formData: FormData) {
  await requirePermission('recordings.create')

  const callId = getString(formData, 'call_id')
  const file = getFile(formData, 'file')
  const durationSeconds = getOptionalDuration(formData)

  const recording = await uploadRecordingRecord({
    callId,
    file,
    durationSeconds,
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calls')
  revalidatePath(`/dashboard/calls/${callId}`)
  revalidatePath('/dashboard/recordings')

  redirect(`/dashboard/recordings/${recording.id}`)
}

export async function deleteRecording(formData: FormData) {
  await requirePermission('recordings.delete')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid recording ID is required.')
  }

  await deleteRecordingRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard/recordings')

  redirect('/dashboard/recordings')
}