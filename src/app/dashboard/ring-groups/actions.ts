'use server'

import { revalidatePath } from 'next/cache'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const STRATEGIES = new Set([
  'simultaneous',
  'sequential',
  'round_robin',
  'least_recently_called',
  'longest_idle',
  'weighted',
])

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function integer(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(text(formData, key), 10)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function memberIds(formData: FormData) {
  return [...new Set(formData.getAll('member_ids').map(String).map((value) => value.trim()).filter(Boolean))]
}

function optionalUuid(formData: FormData, key: string) {
  const value = text(formData, key)
  return value || null
}

function optionalE164(formData: FormData, key: string) {
  const value = text(formData, key)
  if (!value) return null
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error('Failover number must use E.164 format, for example +15551234567.')
  }
  return value
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

  if (error) throw new Error(`Failed to validate ring-group members: ${error.message}`)
  const valid = new Set((data ?? []).map((row) => row.user_id))
  if (ids.some((id) => !valid.has(id))) {
    throw new Error('One or more selected agents are not active members of this organization.')
  }
}

export async function createRingGroup(formData: FormData) {
  const { organization, supabase } = await managementContext()
  const organizationId = organization.organization_id
  const name = text(formData, 'name')
  const strategy = text(formData, 'strategy')
  const members = memberIds(formData)

  if (!name) throw new Error('Ring group name is required.')
  if (!STRATEGIES.has(strategy)) throw new Error('Invalid ring strategy.')
  await validateMembers(supabase, organizationId, members)

  const failoverQueueId = optionalUuid(formData, 'failover_queue_id')
  const failoverNumber = optionalE164(formData, 'failover_number')
  if (failoverQueueId && failoverNumber) {
    throw new Error('Choose either a failover queue or a failover number, not both.')
  }

  const { error } = await supabase.rpc('create_ring_group_configuration', {
    target_organization: organizationId,
    group_name: name,
    group_strategy: strategy,
    ring_timeout: integer(formData, 'ring_timeout_seconds', 25, 5, 120),
    overflow_timeout: integer(formData, 'overflow_timeout_seconds', 20, 5, 120),
    routing_target_limit: integer(formData, 'max_routing_targets', 10, 1, 50),
    overflow_group: optionalUuid(formData, 'overflow_ring_group_id'),
    failover_queue: failoverQueueId,
    failover_phone: failoverNumber,
    active: formData.get('is_active') === 'on',
    member_users: members,
  })

  if (error) throw new Error(`Failed to create ring group: ${error.message}`)
  revalidatePath('/dashboard/ring-groups')
}

export async function updateRingGroup(formData: FormData) {
  const { organization, supabase } = await managementContext()
  const organizationId = organization.organization_id
  const groupId = text(formData, 'id')
  const name = text(formData, 'name')
  const strategy = text(formData, 'strategy')
  const members = memberIds(formData)

  if (!groupId) throw new Error('Ring group ID is missing.')
  if (!name) throw new Error('Ring group name is required.')
  if (!STRATEGIES.has(strategy)) throw new Error('Invalid ring strategy.')
  await validateMembers(supabase, organizationId, members)

  const overflowGroupId = optionalUuid(formData, 'overflow_ring_group_id')
  if (overflowGroupId === groupId) throw new Error('A ring group cannot overflow to itself.')
  const failoverQueueId = optionalUuid(formData, 'failover_queue_id')
  const failoverNumber = optionalE164(formData, 'failover_number')
  if (failoverQueueId && failoverNumber) {
    throw new Error('Choose either a failover queue or a failover number, not both.')
  }

  const { error } = await supabase.rpc('update_ring_group_configuration', {
    target_organization: organizationId,
    target_ring_group: groupId,
    group_name: name,
    group_strategy: strategy,
    ring_timeout: integer(formData, 'ring_timeout_seconds', 25, 5, 120),
    overflow_timeout: integer(formData, 'overflow_timeout_seconds', 20, 5, 120),
    routing_target_limit: integer(formData, 'max_routing_targets', 10, 1, 50),
    overflow_group: overflowGroupId,
    failover_queue: failoverQueueId,
    failover_phone: failoverNumber,
    active: formData.get('is_active') === 'on',
    member_users: members,
  })

  if (error) throw new Error(`Failed to update ring group: ${error.message}`)
  revalidatePath('/dashboard/ring-groups')
}

export async function deleteRingGroup(formData: FormData) {
  const { organization, supabase } = await managementContext()
  const groupId = text(formData, 'id')
  if (!groupId) throw new Error('Ring group ID is missing.')

  const { error } = await supabase.rpc('delete_ring_group_configuration', {
    target_organization: organization.organization_id,
    target_ring_group: groupId,
  })
  if (error) throw new Error(`Failed to delete ring group: ${error.message}`)
  revalidatePath('/dashboard/ring-groups')
}
