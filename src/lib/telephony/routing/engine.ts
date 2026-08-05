import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { CreatedInboundRoute, InboundRoutingPlan, RoutingTarget } from './types'

type MemberRow = { user_id: string; priority: number | null }
type ActiveMemberRow = { user_id: string; status: string | null }
type PresenceRow = { user_id: string; availability: string; activity_state: string; wrap_up_until: string | null; last_seen_at: string | null }
type DeviceRow = { user_id: string; status: string; supports_inbound: boolean; last_heartbeat_at: string | null }

function uniqueTargets(rows: MemberRow[], activeUsers: Set<string>): RoutingTarget[] {
  const seen = new Set<string>()
  return rows
    .filter((row) => activeUsers.has(row.user_id) && !seen.has(row.user_id))
    .map((row) => {
      seen.add(row.user_id)
      return { userId: row.user_id, priority: row.priority ?? 0 }
    })
}

async function activeOrganizationUsers(organizationId: string): Promise<Set<string>> {
  const admin = createTelephonyAdminClient()
  const heartbeatCutoff = new Date(Date.now() - 90_000).toISOString()
  const [{ data: members, error: memberError }, { data: presence, error: presenceError }, { data: devices, error: deviceError }] = await Promise.all([
    admin.from('organization_members').select('user_id, status').eq('organization_id', organizationId).eq('status', 'active'),
    admin.from('agent_presence').select('user_id, availability, activity_state, wrap_up_until, last_seen_at').eq('organization_id', organizationId),
    admin.from('agent_devices').select('user_id, status, supports_inbound, last_heartbeat_at').eq('organization_id', organizationId).eq('status', 'online').eq('supports_inbound', true).gt('last_heartbeat_at', heartbeatCutoff),
  ])
  if (memberError || presenceError || deviceError) {
    throw new Error(memberError?.message ?? presenceError?.message ?? deviceError?.message ?? 'Unable to load active routing members.')
  }

  const activeMembers = new Set(((members ?? []) as ActiveMemberRow[]).map((row) => row.user_id))
  const usersWithOnlineDevices = new Set(((devices ?? []) as DeviceRow[]).map((row) => row.user_id))
  const now = Date.now()
  return new Set(((presence ?? []) as PresenceRow[])
    .filter((row) => {
      const wrapUpActive = row.wrap_up_until ? new Date(row.wrap_up_until).getTime() > now : false
      return activeMembers.has(row.user_id) && usersWithOnlineDevices.has(row.user_id) && row.availability === 'available' && row.activity_state !== 'busy' && row.activity_state !== 'ringing' && !wrapUpActive
    })
    .map((row) => row.user_id))
}

export async function buildInboundRoutingPlan(input: {
  organizationId: string
  calledNumber: string
}): Promise<InboundRoutingPlan> {
  const admin = createTelephonyAdminClient()
  const activeUsers = await activeOrganizationUsers(input.organizationId)
  const { data: phoneNumber, error: phoneError } = await admin
    .from('phone_numbers')
    .select('id, ring_group_id, queue_id, friendly_name')
    .eq('organization_id', input.organizationId)
    .eq('phone_number', input.calledNumber)
    .eq('is_active', true)
    .maybeSingle()
  if (phoneError) throw new Error(`Unable to resolve inbound phone number: ${phoneError.message}`)

  if (phoneNumber?.ring_group_id) {
    const [{ data: group, error: groupError }, { data: members, error: memberError }] = await Promise.all([
      admin.from('ring_groups').select('id, strategy, ring_timeout_seconds, name').eq('organization_id', input.organizationId).eq('id', phoneNumber.ring_group_id).eq('is_active', true).maybeSingle(),
      admin.from('ring_group_members').select('user_id, priority').eq('organization_id', input.organizationId).eq('ring_group_id', phoneNumber.ring_group_id).eq('is_active', true).order('priority'),
    ])
    if (groupError || memberError) throw new Error(groupError?.message ?? memberError?.message ?? 'Unable to load ring group.')
    if (group) return {
      organizationId: input.organizationId,
      phoneNumberId: phoneNumber.id,
      ringGroupId: group.id,
      queueId: null,
      routeType: 'ring_group',
      strategy: group.strategy === 'sequential' ? 'sequential' : 'simultaneous',
      timeoutSeconds: group.ring_timeout_seconds,
      targets: uniqueTargets((members ?? []) as MemberRow[], activeUsers),
      metadata: { phoneNumberName: phoneNumber.friendly_name, ringGroupName: group.name },
    }
  }

  if (phoneNumber?.queue_id) {
    const [{ data: queue, error: queueError }, { data: members, error: memberError }] = await Promise.all([
      admin.from('call_queues').select('id, name, max_wait_seconds').eq('organization_id', input.organizationId).eq('id', phoneNumber.queue_id).eq('is_active', true).maybeSingle(),
      admin.from('queue_members').select('user_id, priority').eq('organization_id', input.organizationId).eq('queue_id', phoneNumber.queue_id).eq('is_active', true).order('priority'),
    ])
    if (queueError || memberError) throw new Error(queueError?.message ?? memberError?.message ?? 'Unable to load call queue.')
    if (queue) return {
      organizationId: input.organizationId,
      phoneNumberId: phoneNumber.id,
      ringGroupId: null,
      queueId: queue.id,
      routeType: 'queue',
      strategy: 'sequential',
      timeoutSeconds: Math.min(queue.max_wait_seconds, 120),
      targets: uniqueTargets((members ?? []) as MemberRow[], activeUsers),
      metadata: { phoneNumberName: phoneNumber.friendly_name, queueName: queue.name },
    }
  }

  const fallbackTargets = Array.from(activeUsers).slice(0, 10).map((userId, priority) => ({ userId, priority }))
  return {
    organizationId: input.organizationId,
    phoneNumberId: phoneNumber?.id ?? null,
    ringGroupId: null,
    queueId: null,
    routeType: 'organization_fallback',
    strategy: 'simultaneous',
    timeoutSeconds: 25,
    targets: fallbackTargets,
    metadata: { phoneNumberName: phoneNumber?.friendly_name ?? null },
  }
}

export async function createInboundRoute(input: {
  organizationId: string
  provider: string
  providerCallId: string
  fromNumber: string
  toNumber: string
  createdBy: string | null
}): Promise<CreatedInboundRoute> {
  const admin = createTelephonyAdminClient()
  const existing = await admin
    .from('call_routing_attempts')
    .select('id, call_id, phone_number_id, ring_group_id, queue_id, route_type, strategy, selected_user_ids, metadata')
    .eq('organization_id', input.organizationId)
    .eq('provider', input.provider)
    .eq('provider_call_id', input.providerCallId)
    .maybeSingle()
  if (existing.error) throw new Error(`Unable to check duplicate inbound route: ${existing.error.message}`)
  if (existing.data) {
    return {
      organizationId: input.organizationId,
      callId: existing.data.call_id,
      routingAttemptId: existing.data.id,
      phoneNumberId: existing.data.phone_number_id,
      ringGroupId: existing.data.ring_group_id,
      queueId: existing.data.queue_id,
      routeType: existing.data.route_type as CreatedInboundRoute['routeType'],
      strategy: existing.data.strategy as CreatedInboundRoute['strategy'],
      timeoutSeconds: 25,
      targets: (existing.data.selected_user_ids ?? []).map((userId: string, priority: number) => ({ userId, priority })),
      metadata: existing.data.metadata ?? {},
      duplicate: true,
    }
  }

  const plan = await buildInboundRoutingPlan({ organizationId: input.organizationId, calledNumber: input.toNumber })
  const { data: call, error: callError } = await admin.from('calls').insert({
    organization_id: input.organizationId,
    direction: 'inbound', status: 'ringing', routing_status: plan.targets.length ? 'routing' : 'no_agents',
    started_at: new Date().toISOString(), recording_available: false,
    provider: input.provider, provider_call_sid: input.providerCallId,
    from_number: input.fromNumber, to_number: input.toNumber,
    metadata: { source: 'inbound_number' }, routing_metadata: plan.metadata,
    created_by: input.createdBy,
  }).select('id').single()
  if (callError || !call) throw new Error(`Unable to create inbound call: ${callError?.message ?? 'No call returned.'}`)

  const attemptStatus = plan.targets.length ? 'routing' : 'no_agents'
  const { data: attempt, error: attemptError } = await admin.from('call_routing_attempts').insert({
    organization_id: input.organizationId, call_id: call.id, provider: input.provider,
    provider_call_id: input.providerCallId, phone_number_id: plan.phoneNumberId,
    ring_group_id: plan.ringGroupId, queue_id: plan.queueId, route_type: plan.routeType,
    strategy: plan.strategy, status: attemptStatus,
    selected_user_ids: plan.targets.map((target) => target.userId), metadata: plan.metadata,
    failure_reason: plan.targets.length ? null : 'No active routing members were available.',
  }).select('id').single()
  if (attemptError || !attempt) {
    await admin.from('calls').delete().eq('id', call.id).eq('organization_id', input.organizationId)
    throw new Error(`Unable to create routing attempt: ${attemptError?.message ?? 'No attempt returned.'}`)
  }

  await Promise.all([
    admin.from('calls').update({ routing_attempt_id: attempt.id }).eq('id', call.id).eq('organization_id', input.organizationId),
    admin.from('call_routing_history').insert({
      organization_id: input.organizationId, call_id: call.id, routing_attempt_id: attempt.id,
      event_type: 'route_created', from_status: null, to_status: attemptStatus,
      provider_call_id: input.providerCallId,
      metadata: { ...plan.metadata, selectedUserIds: plan.targets.map((target) => target.userId) },
    }),
  ])

  return { ...plan, callId: call.id, routingAttemptId: attempt.id, duplicate: false }
}
