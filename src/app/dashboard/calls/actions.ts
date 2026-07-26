'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth'
import {
  createCall as createCallRecord,
  deleteCall as deleteCallRecord,
  updateCall as updateCallRecord,
  type CallDirection,
  type CallFormValues,
  type CallStatus,
} from '@/lib/calls'

const CALL_DIRECTIONS: CallDirection[] = ['outbound', 'inbound']

const CALL_STATUSES: CallStatus[] = [
  'completed',
  'failed',
  'scheduled',
  'cancelled',
]

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? ''
}

function getBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)

  return value === 'on' || value === 'true' || value === '1'
}

function getDirection(formData: FormData): CallDirection {
  const value = getString(formData, 'direction')

  if (CALL_DIRECTIONS.includes(value as CallDirection)) {
    return value as CallDirection
  }

  return 'outbound'
}

function getStatus(formData: FormData): CallStatus {
  const value = getString(formData, 'status')

  if (CALL_STATUSES.includes(value as CallStatus)) {
    return value as CallStatus
  }

  return 'scheduled'
}

function getCallValues(formData: FormData): CallFormValues {
  return {
    campaign_id: getString(formData, 'campaign_id'),
    contact_id: getString(formData, 'contact_id'),
    direction: getDirection(formData),
    status: getStatus(formData),
    started_at: getString(formData, 'started_at'),
    duration_seconds: getString(formData, 'duration_seconds'),
    recording_available: getBoolean(formData, 'recording_available'),
    notes: getString(formData, 'notes'),
  }
}

export async function createCall(formData: FormData) {
  await requirePermission('calls.create')

  const call = await createCallRecord(getCallValues(formData))

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calls')

  redirect(`/dashboard/calls/${call.id}`)
}

export async function updateCall(formData: FormData) {
  await requirePermission('calls.update')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid call ID is required.')
  }

  await updateCallRecord(id, getCallValues(formData))

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calls')
  revalidatePath(`/dashboard/calls/${id}`)
  revalidatePath(`/dashboard/calls/${id}/edit`)

  redirect(`/dashboard/calls/${id}`)
}

export async function deleteCall(formData: FormData) {
  await requirePermission('calls.delete')

  const id = getString(formData, 'id')

  if (!id) {
    throw new Error('A valid call ID is required.')
  }

  await deleteCallRecord(id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calls')

  redirect('/dashboard/calls')
}