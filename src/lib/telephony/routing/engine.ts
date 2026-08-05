import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { enqueueInboundCall } from '@/lib/telephony/queues/service'
import type {
  CreatedInboundRoute,
  InboundRoutingPlan,
  InboundRoutingStrategy,
  RoutingTarget,
} from './types'

type MemberRow = {
  user_id: string
  priority: number | null
  weight: number | null
  last_routed_at: string | null
  last_answered_at: string | null
}

type ActiveMemberRow = { user_id: string; status: string | null }
type PresenceRow = {
  user_id: string
  availability: string
  activity_state: string
  wrap_up_until: string | null
  last_seen_at: string | null
  last_available_at: string | null
}
type DeviceRow = {
  user_id: string
  status: string
  supports_inbound: boolean
  last_heartbeat_at: string | null
}
type RingGroupRow = {
  id: string
  name: string
  strategy: string
  ring_timeout_seconds: number
  overflow_timeout_seconds: number
  max_routing_targets: number
  overflow_ring_group_id: string | null
  failover_queue_id: string | null
  failover_number: string | null
}

function asTime(value: string | null): number {
  return value ? new Date(value).getTime() : 0
}

function normalizeStrategy(value: string): InboundRoutingStrategy {
  switch (value) {
    case 'sequential':
    case 'round_robin':
    case 'least_recently_called':
    case 'longest_idle':
    case 'weighted':
      return value
    default:
      return 'simultaneous'
  }
}

function targetFromMember(member: MemberRow, tier: number, ringGroupId: string): RoutingTarget {
  return {
    kind: 'user',
    userId: member.user_id,
    phoneNumber: null,
    priority: member.priority ?? 0,
    weight: member.weight ?? 1,
    tier,
    sourceRingGroupId: ringGroupId,
  }
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function weightedOrder(rows: MemberRow[], seed: string): MemberRow[] {
  return [...rows].sort((left, right) => {
    const leftWeight = Math.max(1, left.weight ?? 1)
    const rightWeight = Math.max(1, right.weight ?? 1)
    const leftScore = stableHash(`${seed}:${left.user_id}`) / leftWeight
    const rightScore = stableHash(`${seed}:${right.user_id}`) / rightWeight
    return leftScore - rightScore || (left.priority ?? 0) - (right.priority ?? 0)
  })
}

async function activeOrganizationUsers(organizationId: string): Promise<{
  activeUsers: Set<string>
  presenceByUser: Map<string, PresenceRow>
}> {
  const admin = createTelephonyAdminClient()
  const heartbeatCutoff = new Date(Date.now() - 90_000).toISOString()
  const [
    { data: members, error: memberError },
    { data: presence, error: presenceError },
    { data: devices, error: deviceError },
  ] = await Promise.all([
    admin
      .from('organization_members')
      .select('user_id, status')
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    admin
      .from('agent_presence')
      .select('user_id, availability, activity_state, wrap_up_until, last_seen_at, last_available_at')
      .eq('organization_id', organizationId),
    admin
      .from('agent_devices')
      .select('user_id, status, supports_inbound, last_heartbeat_at')
      .eq('organization_id', organizationId)
      .eq('status', 'online')
      .eq('supports_inbound', true)
      .gt('last_heartbeat_at', heartbeatCutoff),
  ])

  if (memberError || presenceError || deviceError) {
    throw new Error(
      memberError?.message ??
        presenceError?.message ??
        deviceError?.message ??
        'Unable to load active routing members.',
    )
  }

  const activeMembers = new Set(((members ?? []) as ActiveMemberRow[]).map((row) => row.user_id))
  const usersWithOnlineDevices = new Set(((devices ?? []) as DeviceRow[]).map((row) => row.user_id))
  const presenceRows = (presence ?? []) as PresenceRow[]
  const presenceByUser = new Map(presenceRows.map((row) => [row.user_id, row]))
  const now = Date.now()
  const activeUsers = new Set(
    presenceRows
      .filter((row) => {
        const wrapUpActive = row.wrap_up_until ? new Date(row.wrap_up_until).getTime() > now : false
        return (
          activeMembers.has(row.user_id) &&
          usersWithOnlineDevices.has(row.user_id) &&
          row.availability === 'available' &&
          row.activity_state !== 'busy' &&
          row.activity_state !== 'ringing' &&
          !wrapUpActive
        )
      })
      .map((row) => row.user_id),
  )

  return { activeUsers, presenceByUser }
}

async function orderMembers(input: {
  organizationId: string
  ringGroupId: string
  strategy: InboundRoutingStrategy
  members: MemberRow[]
  presenceByUser: Map<string, PresenceRow>
  providerCallId: string
}): Promise<MemberRow[]> {
  const byPriority = [...input.members].sort(
    (left, right) =>
      (left.priority ?? 0) - (right.priority ?? 0) || left.user_id.localeCompare(right.user_id),
  )

  if (input.strategy === 'round_robin' && byPriority.length > 0) {
    const admin = createTelephonyAdminClient()
    const { data, error } = await admin.rpc('advance_ring_group_cursor', {
      target_organization: input.organizationId,
      target_ring_group: input.ringGroupId,
      member_count: byPriority.length,
    })
    if (error) throw new Error(`Unable to advance ring-group cursor: ${error.message}`)
    const position = typeof data === 'number' ? data : 0
    return [...byPriority.slice(position), ...byPriority.slice(0, position)]
  }

  if (input.strategy === 'least_recently_called') {
    return byPriority.sort(
      (left, right) =>
        asTime(left.last_routed_at) - asTime(right.last_routed_at) ||
        (left.priority ?? 0) - (right.priority ?? 0),
    )
  }

  if (input.strategy === 'longest_idle') {
    return byPriority.sort((left, right) => {
      const leftPresence = input.presenceByUser.get(left.user_id)
      const rightPresence = input.presenceByUser.get(right.user_id)
      return (
        asTime(leftPresence?.last_available_at ?? leftPresence?.last_seen_at ?? null) -
          asTime(rightPresence?.last_available_at ?? rightPresence?.last_seen_at ?? null) ||
        (left.priority ?? 0) - (right.priority ?? 0)
      )
    })
  }

  if (input.strategy === 'weighted') {
    return weightedOrder(byPriority, input.providerCallId)
  }

  return byPriority
}

async function loadRingGroupTargets(input: {
  organizationId: string
  ringGroupId: string
  activeUsers: Set<string>
  presenceByUser: Map<string, PresenceRow>
  providerCallId: string
  tier: number
  visited: Set<string>
}): Promise<{ group: RingGroupRow | null; targets: RoutingTarget[]; overflowChain: string[] }> {
  if (input.visited.has(input.ringGroupId) || input.tier > 5) {
    return { group: null, targets: [], overflowChain: [] }
  }
  input.visited.add(input.ringGroupId)

  const admin = createTelephonyAdminClient()
  const [{ data: group, error: groupError }, { data: members, error: memberError }] = await Promise.all([
    admin
      .from('ring_groups')
      .select(
        'id, name, strategy, ring_timeout_seconds, overflow_timeout_seconds, max_routing_targets, overflow_ring_group_id, failover_queue_id, failover_number',
      )
      .eq('organization_id', input.organizationId)
      .eq('id', input.ringGroupId)
      .eq('is_active', true)
      .maybeSingle(),
    admin
      .from('ring_group_members')
      .select('user_id, priority, weight, last_routed_at, last_answered_at')
      .eq('organization_id', input.organizationId)
      .eq('ring_group_id', input.ringGroupId)
      .eq('is_active', true),
  ])

  if (groupError || memberError) {
    throw new Error(groupError?.message ?? memberError?.message ?? 'Unable to load ring group.')
  }
  if (!group) return { group: null, targets: [], overflowChain: [] }

  const strategy = normalizeStrategy(group.strategy)
  const eligibleMembers = ((members ?? []) as MemberRow[]).filter((member) =>
    input.activeUsers.has(member.user_id),
  )
  const orderedMembers = await orderMembers({
    organizationId: input.organizationId,
    ringGroupId: group.id,
    strategy,
    members: eligibleMembers,
    presenceByUser: input.presenceByUser,
    providerCallId: input.providerCallId,
  })
  const primaryTargets = orderedMembers
    .slice(0, group.max_routing_targets)
    .map((member) => targetFromMember(member, input.tier, group.id))

  let overflowTargets: RoutingTarget[] = []
  let overflowChain: string[] = [group.id]
  if (group.overflow_ring_group_id) {
    const overflow = await loadRingGroupTargets({
      ...input,
      ringGroupId: group.overflow_ring_group_id,
      tier: input.tier + 1,
    })
    overflowTargets = overflow.targets
    overflowChain = [...overflowChain, ...overflow.overflowChain]
  }

  if (group.failover_queue_id) {
    const { data: queueMembers, error: queueMemberError } = await admin
      .from('queue_members')
      .select('user_id, priority')
      .eq('organization_id', input.organizationId)
      .eq('queue_id', group.failover_queue_id)
      .eq('is_active', true)
      .order('priority')
    if (queueMemberError) {
      throw new Error(`Unable to load ring-group failover queue: ${queueMemberError.message}`)
    }
    overflowTargets.push(
      ...((queueMembers ?? []) as Array<{ user_id: string; priority: number | null }>)
        .filter((member) => input.activeUsers.has(member.user_id))
        .map((member) => ({
          kind: 'user' as const,
          userId: member.user_id,
          phoneNumber: null,
          priority: member.priority ?? 0,
          weight: 1,
          tier: input.tier + 2,
          sourceRingGroupId: null,
        })),
    )
  }

  if (group.failover_number?.trim()) {
    overflowTargets.push({
      kind: 'number',
      userId: null,
      phoneNumber: group.failover_number.trim(),
      priority: Number.MAX_SAFE_INTEGER,
      weight: 1,
      tier: input.tier + 2,
      sourceRingGroupId: group.id,
    })
  }

  return {
    group: group as RingGroupRow,
    targets: [...primaryTargets, ...overflowTargets],
    overflowChain,
  }
}

export async function buildInboundRoutingPlan(input: {
  organizationId: string
  calledNumber: string
  providerCallId: string
}): Promise<InboundRoutingPlan> {
  const admin = createTelephonyAdminClient()
  const { activeUsers, presenceByUser } = await activeOrganizationUsers(input.organizationId)
  const { data: phoneNumber, error: phoneError } = await admin
    .from('phone_numbers')
    .select('id, ring_group_id, queue_id, friendly_name')
    .eq('organization_id', input.organizationId)
    .eq('phone_number', input.calledNumber)
    .eq('is_active', true)
    .maybeSingle()
  if (phoneError) throw new Error(`Unable to resolve inbound phone number: ${phoneError.message}`)

  if (phoneNumber?.ring_group_id) {
    const loaded = await loadRingGroupTargets({
      organizationId: input.organizationId,
      ringGroupId: phoneNumber.ring_group_id,
      activeUsers,
      presenceByUser,
      providerCallId: input.providerCallId,
      tier: 0,
      visited: new Set<string>(),
    })
    if (loaded.group) {
      return {
        organizationId: input.organizationId,
        phoneNumberId: phoneNumber.id,
        ringGroupId: loaded.group.id,
        queueId: loaded.group.failover_queue_id,
        routeType: 'ring_group',
        strategy: normalizeStrategy(loaded.group.strategy),
        timeoutSeconds: loaded.group.ring_timeout_seconds,
        targets: loaded.targets,
        metadata: {
          phoneNumberName: phoneNumber.friendly_name,
          ringGroupName: loaded.group.name,
          overflowChain: loaded.overflowChain,
          overflowTimeoutSeconds: loaded.group.overflow_timeout_seconds,
          failoverQueueId: loaded.group.failover_queue_id,
        },
      }
    }
  }

  if (phoneNumber?.queue_id) {
    const [{ data: queue, error: queueError }, { data: members, error: memberError }] = await Promise.all([
      admin
        .from('call_queues')
        .select('id, name, max_wait_seconds, max_size, priority_mode, overflow_queue_id, overflow_number, announce_position, announce_estimated_wait')
        .eq('organization_id', input.organizationId)
        .eq('id', phoneNumber.queue_id)
        .eq('is_active', true)
        .maybeSingle(),
      admin
        .from('queue_members')
        .select('user_id, priority')
        .eq('organization_id', input.organizationId)
        .eq('queue_id', phoneNumber.queue_id)
        .eq('is_active', true)
        .order('priority'),
    ])
    if (queueError || memberError) {
      throw new Error(queueError?.message ?? memberError?.message ?? 'Unable to load call queue.')
    }
    if (queue) {
      const eligibleQueueUserIds = ((members ?? []) as Array<{ user_id: string; priority: number | null }>)
        .filter((member) => activeUsers.has(member.user_id))
        .map((member) => member.user_id)
      return {
        organizationId: input.organizationId,
        phoneNumberId: phoneNumber.id,
        ringGroupId: null,
        queueId: queue.id,
        routeType: 'queue',
        strategy: 'sequential',
        timeoutSeconds: Math.min(queue.max_wait_seconds, 3600),
        targets: [],
        metadata: {
          phoneNumberName: phoneNumber.friendly_name,
          queueName: queue.name,
          queueMaxSize: queue.max_size,
          queuePriorityMode: queue.priority_mode,
          overflowQueueId: queue.overflow_queue_id,
          overflowNumber: queue.overflow_number,
          announcePosition: queue.announce_position,
          announceEstimatedWait: queue.announce_estimated_wait,
          eligibleQueueUserIds,
        },
      }
    }
  }

  const fallbackTargets = Array.from(activeUsers)
    .slice(0, 10)
    .map((userId, priority) => ({
      kind: 'user' as const,
      userId,
      phoneNumber: null,
      priority,
      weight: 1,
      tier: 0,
      sourceRingGroupId: null,
    }))
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
    .select(
      'id, call_id, phone_number_id, ring_group_id, queue_id, route_type, strategy, selected_user_ids, metadata',
    )
    .eq('organization_id', input.organizationId)
    .eq('provider', input.provider)
    .eq('provider_call_id', input.providerCallId)
    .maybeSingle()
  if (existing.error) throw new Error(`Unable to check duplicate inbound route: ${existing.error.message}`)
  if (existing.data) {
    const existingRoute = existing.data
    const storedTargets = Array.isArray(existingRoute.metadata?.targets)
      ? (existingRoute.metadata.targets as RoutingTarget[])
      : (existingRoute.selected_user_ids ?? []).map((userId: string, priority: number) => ({
          kind: 'user' as const,
          userId,
          phoneNumber: null,
          priority,
          weight: 1,
          tier: 0,
          sourceRingGroupId: existingRoute.ring_group_id,
        }))
    return {
      organizationId: input.organizationId,
      callId: existingRoute.call_id,
      routingAttemptId: existingRoute.id,
      phoneNumberId: existingRoute.phone_number_id,
      ringGroupId: existingRoute.ring_group_id,
      queueId: existingRoute.queue_id,
      routeType: existingRoute.route_type as CreatedInboundRoute['routeType'],
      strategy: existingRoute.strategy as CreatedInboundRoute['strategy'],
      timeoutSeconds:
        typeof existingRoute.metadata?.timeoutSeconds === 'number'
          ? existingRoute.metadata.timeoutSeconds
          : 25,
      targets: storedTargets,
      metadata: existingRoute.metadata ?? {},
      queueEntryId:
        typeof existingRoute.metadata?.queueEntryId === 'string'
          ? existingRoute.metadata.queueEntryId
          : null,
      queueAccepted: existingRoute.route_type === 'queue',
      duplicate: true,
    }
  }

  const plan = await buildInboundRoutingPlan({
    organizationId: input.organizationId,
    calledNumber: input.toNumber,
    providerCallId: input.providerCallId,
  })
  const { data: call, error: callError } = await admin
    .from('calls')
    .insert({
      organization_id: input.organizationId,
      direction: 'inbound',
      status: 'ringing',
      routing_status: plan.targets.length ? 'routing' : 'no_agents',
      started_at: new Date().toISOString(),
      recording_available: false,
      provider: input.provider,
      provider_call_sid: input.providerCallId,
      from_number: input.fromNumber,
      to_number: input.toNumber,
      metadata: { source: 'inbound_number' },
      routing_metadata: plan.metadata,
      created_by: input.createdBy,
    })
    .select('id')
    .single()
  if (callError || !call) {
    throw new Error(`Unable to create inbound call: ${callError?.message ?? 'No call returned.'}`)
  }

  const attemptStatus = plan.routeType === 'queue' ? 'queued' : plan.targets.length ? 'routing' : 'no_agents'
  const attemptMetadata = {
    ...plan.metadata,
    timeoutSeconds: plan.timeoutSeconds,
    targets: plan.targets,
  }
  const { data: attempt, error: attemptError } = await admin
    .from('call_routing_attempts')
    .insert({
      organization_id: input.organizationId,
      call_id: call.id,
      provider: input.provider,
      provider_call_id: input.providerCallId,
      phone_number_id: plan.phoneNumberId,
      ring_group_id: plan.ringGroupId,
      queue_id: plan.queueId,
      route_type: plan.routeType,
      strategy: plan.strategy,
      status: attemptStatus,
      selected_user_ids: plan.targets
        .filter((target) => target.kind === 'user' && target.userId)
        .map((target) => target.userId),
      metadata: attemptMetadata,
      failure_reason:
        plan.routeType === 'queue' || plan.targets.length
          ? null
          : 'No active routing members were available.',
    })
    .select('id')
    .single()
  if (attemptError || !attempt) {
    await admin.from('calls').delete().eq('id', call.id).eq('organization_id', input.organizationId)
    throw new Error(
      `Unable to create routing attempt: ${attemptError?.message ?? 'No attempt returned.'}`,
    )
  }

  let queueEntryId: string | null = null
  let queueAccepted = plan.routeType !== 'queue'
  if (plan.routeType === 'queue' && plan.queueId) {
    const queued = await enqueueInboundCall({
      organizationId: input.organizationId,
      queueId: plan.queueId,
      callId: call.id,
      routingAttemptId: attempt.id,
      provider: input.provider,
      providerCallId: input.providerCallId,
      metadata: plan.metadata,
    })
    queueEntryId = queued.entryId
    queueAccepted = queued.accepted
    Object.assign(attemptMetadata, {
      queueEntryId,
      queuePosition: queued.position,
      estimatedWaitSeconds: queued.estimatedWaitSeconds,
      maxWaitSeconds: queued.maxWaitSeconds,
      announcePosition: queued.announcePosition,
      announceEstimatedWait: queued.announceEstimatedWait,
      overflowQueueId: queued.overflowQueueId,
      overflowNumber: queued.overflowNumber,
      queueAccepted,
      queueRejectionReason: queued.reason,
    })
  }

  const routedByGroup = new Map<string, string[]>()
  for (const target of plan.targets) {
    if (target.kind !== 'user' || !target.userId || !target.sourceRingGroupId) continue
    const users = routedByGroup.get(target.sourceRingGroupId) ?? []
    users.push(target.userId)
    routedByGroup.set(target.sourceRingGroupId, users)
  }

  await Promise.all([
    admin
      .from('calls')
      .update({
        routing_attempt_id: attempt.id,
        routing_status:
          plan.routeType === 'queue' ? (queueAccepted ? 'queued' : 'overflow') : attemptStatus,
        routing_metadata: attemptMetadata,
      })
      .eq('id', call.id)
      .eq('organization_id', input.organizationId),
    admin
      .from('call_routing_attempts')
      .update({
        status: plan.routeType === 'queue' ? (queueAccepted ? 'queued' : 'overflow') : attemptStatus,
        metadata: attemptMetadata,
        failure_reason:
          plan.routeType === 'queue' && !queueAccepted
            ? 'Queue capacity was reached.'
            : null,
      })
      .eq('id', attempt.id)
      .eq('organization_id', input.organizationId),
    admin.from('call_routing_history').insert({
      organization_id: input.organizationId,
      call_id: call.id,
      routing_attempt_id: attempt.id,
      event_type: 'route_created',
      from_status: null,
      to_status: attemptStatus,
      provider_call_id: input.providerCallId,
      metadata: {
        ...attemptMetadata,
        selectedUserIds: plan.targets
          .filter((target) => target.kind === 'user')
          .map((target) => target.userId),
      },
    }),
    ...Array.from(routedByGroup.entries()).map(([ringGroupId, userIds]) =>
      admin.rpc('mark_ring_group_targets_routed', {
        target_organization: input.organizationId,
        target_ring_group: ringGroupId,
        target_users: userIds,
      }),
    ),
  ])

  return {
    ...plan,
    callId: call.id,
    routingAttemptId: attempt.id,
    queueEntryId,
    queueAccepted,
    metadata: attemptMetadata,
    duplicate: false,
  }
}
