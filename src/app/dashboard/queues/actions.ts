'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const PRIORITY_MODES = new Set(['fifo', 'priority'])

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function integer(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(text(formData, key), 10)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function optionalUuid(formData: FormData, key: string) {
  const value = text(formData, key)
  return value || null
}

function optionalE164(formData: FormData, key: string) {
  const value = text(formData, key)
  if (!value) return null
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error('Overflow number must use E.164 format, for example +15551234567.')
  }
  return value
}

function memberIds(formData: FormData) {
  return [...new Set(formData.getAll('member_ids').map(String).map((value) => value.trim()).filter(Boolean))]
}

async function managementContext() {
  const organization = await requirePermission('settings.manage')
  const supabase = await createClient()
  return { organization, supabase }
}

async function validateMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  ids: string[],
) {
  if (ids.length === 0) return
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .in('user_id', ids)

  if (error) throw new Error(`Failed to validate queue members: ${error.message}`)
  const valid = new Set((data ?? []).map((row) => row.user_id))
  if (ids.some((id) => !valid.has(id))) {
    throw new Error('One or more selected agents are not active members of this organization.')
  }
}

function configuration(formData: FormData) {
  const name = text(formData, 'name')
  const priorityMode = text(formData, 'priority_mode')
  const overflowQueueId = optionalUuid(formData, 'overflow_queue_id')
  const overflowNumber = optionalE164(formData, 'overflow_number')

  if (!name) throw new Error('Queue name is required.')
  if (!PRIORITY_MODES.has(priorityMode)) throw new Error('Invalid queue ordering mode.')
  if (overflowQueueId && overflowNumber) {
    throw new Error('Choose either an overflow queue or an overflow number, not both.')
  }

  return {
    name,
    priorityMode,
    overflowQueueId,
    overflowNumber,
    maxWaitSeconds: integer(formData, 'max_wait_seconds', 300, 30, 3600),
    maxSize: integer(formData, 'max_size', 50, 1, 1000),
    reservationTimeoutSeconds: integer(formData, 'reservation_timeout_seconds', 30, 5, 300),
    targetAnswerSeconds: integer(formData, 'target_answer_seconds', 20, 5, 120),
    averageHandleSeconds: integer(formData, 'average_handle_seconds', 300, 15, 14400),
    maxRequeueAttempts: integer(formData, 'max_requeue_attempts', 3, 0, 20),
    announcePosition: formData.get('announce_position') === 'on',
    announceEstimatedWait: formData.get('announce_estimated_wait') === 'on',
    active: formData.get('is_active') === 'on',
    members: memberIds(formData),
  }
}

export async function createCallQueue(formData: FormData) {
  const { organization, supabase } = await managementContext()
  const organizationId = organization.organization_id
  const config = configuration(formData)
  await validateMembers(supabase, organizationId, config.members)

  const { error } = await supabase.rpc('create_call_queue_configuration', {
    target_organization: organizationId,
    queue_name: config.name,
    queue_priority_mode: config.priorityMode,
    queue_max_wait_seconds: config.maxWaitSeconds,
    queue_max_size: config.maxSize,
    queue_overflow_queue: config.overflowQueueId,
    queue_overflow_number: config.overflowNumber,
    queue_reservation_timeout_seconds: config.reservationTimeoutSeconds,
    queue_target_answer_seconds: config.targetAnswerSeconds,
    queue_average_handle_seconds: config.averageHandleSeconds,
    queue_max_requeue_attempts: config.maxRequeueAttempts,
    queue_announce_position: config.announcePosition,
    queue_announce_estimated_wait: config.announceEstimatedWait,
    active: config.active,
    member_users: config.members,
  })

  if (error) throw new Error(`Failed to create call queue: ${error.message}`)
  revalidatePath('/dashboard/queues')
  revalidatePath('/dashboard/ring-groups')
}

export async function updateCallQueue(formData: FormData) {
  const { organization, supabase } = await managementContext()
  const organizationId = organization.organization_id
  const queueId = text(formData, 'id')
  if (!queueId) throw new Error('Queue ID is missing.')

  const config = configuration(formData)
  if (config.overflowQueueId === queueId) throw new Error('A queue cannot overflow to itself.')
  await validateMembers(supabase, organizationId, config.members)

  const { error } = await supabase.rpc('update_call_queue_configuration', {
    target_organization: organizationId,
    target_queue: queueId,
    queue_name: config.name,
    queue_priority_mode: config.priorityMode,
    queue_max_wait_seconds: config.maxWaitSeconds,
    queue_max_size: config.maxSize,
    queue_overflow_queue: config.overflowQueueId,
    queue_overflow_number: config.overflowNumber,
    queue_reservation_timeout_seconds: config.reservationTimeoutSeconds,
    queue_target_answer_seconds: config.targetAnswerSeconds,
    queue_average_handle_seconds: config.averageHandleSeconds,
    queue_max_requeue_attempts: config.maxRequeueAttempts,
    queue_announce_position: config.announcePosition,
    queue_announce_estimated_wait: config.announceEstimatedWait,
    active: config.active,
    member_users: config.members,
  })

  if (error) throw new Error(`Failed to update call queue: ${error.message}`)
  revalidatePath('/dashboard/queues')
  revalidatePath('/dashboard/ring-groups')
}

export async function deleteCallQueue(formData: FormData) {
  const { organization, supabase } = await managementContext()
  const queueId = text(formData, 'id')
  if (!queueId) throw new Error('Queue ID is missing.')

  const { error } = await supabase.rpc('delete_call_queue_configuration', {
    target_organization: organization.organization_id,
    target_queue: queueId,
  })
  if (error) throw new Error(`Failed to delete call queue: ${error.message}`)
  revalidatePath('/dashboard/queues')
  revalidatePath('/dashboard/ring-groups')
}
