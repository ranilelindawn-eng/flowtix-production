import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { AgentActivityState, AgentAvailability, AgentDeviceStatus, AgentPresenceSnapshot } from './types'

type PresenceRow = {
  organization_id: string
  user_id: string
  availability: AgentAvailability
  activity_state: AgentActivityState
  active_call_id: string | null
  wrap_up_until: string | null
  last_seen_at: string | null
}

export async function getAgentPresence(organizationId: string, userId: string): Promise<AgentPresenceSnapshot> {
  const admin = createTelephonyAdminClient()
  const [{ data: presence, error: presenceError }, { count, error: deviceError }] = await Promise.all([
    admin.from('agent_presence').select('organization_id,user_id,availability,activity_state,active_call_id,wrap_up_until,last_seen_at').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
    admin.from('agent_devices').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('user_id', userId).eq('status', 'online').eq('supports_inbound', true).gt('last_heartbeat_at', new Date(Date.now() - 90_000).toISOString()),
  ])
  if (presenceError || deviceError) throw new Error(presenceError?.message ?? deviceError?.message ?? 'Unable to load presence.')
  const row = presence as PresenceRow | null
  const onlineDeviceCount = count ?? 0
  const wrapUpActive = row?.wrap_up_until ? new Date(row.wrap_up_until).getTime() > Date.now() : false
  return {
    organizationId,
    userId,
    availability: row?.availability ?? 'offline',
    activityState: wrapUpActive ? 'wrap_up' : (row?.activity_state ?? 'idle'),
    activeCallId: row?.active_call_id ?? null,
    wrapUpUntil: row?.wrap_up_until ?? null,
    lastSeenAt: row?.last_seen_at ?? null,
    onlineDeviceCount,
    routable: onlineDeviceCount > 0 && row?.availability === 'available' && (row.activity_state === 'idle' || (row.activity_state === 'wrap_up' && !wrapUpActive)),
  }
}

export async function heartbeatAgentDevice(input: {
  organizationId: string; userId: string; deviceKey: string; provider: string; providerIdentity?: string | null
  status: AgentDeviceStatus; supportsInbound?: boolean; callId?: string | null; metadata?: Record<string, unknown>
}): Promise<AgentPresenceSnapshot> {
  const admin = createTelephonyAdminClient()
  const { error } = await admin.rpc('refresh_agent_presence', {
    target_organization: input.organizationId, target_user: input.userId, target_device_key: input.deviceKey,
    target_provider: input.provider, target_provider_identity: input.providerIdentity ?? null,
    target_device_status: input.status, target_supports_inbound: input.supportsInbound ?? true,
    target_call: input.callId ?? null, target_metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Unable to refresh agent presence: ${error.message}`)
  return getAgentPresence(input.organizationId, input.userId)
}

export async function setAgentAvailability(input: { organizationId: string; userId: string; availability: AgentAvailability }): Promise<AgentPresenceSnapshot> {
  const admin = createTelephonyAdminClient()
  const { error } = await admin.rpc('set_agent_availability', {
    target_organization: input.organizationId, target_user: input.userId,
    target_availability: input.availability, target_metadata: { source: 'dialer' },
  })
  if (error) throw new Error(`Unable to set availability: ${error.message}`)
  return getAgentPresence(input.organizationId, input.userId)
}

export async function setAgentCallActivity(input: {
  organizationId: string; userId: string; state: AgentActivityState; callId?: string | null; wrapUpSeconds?: number
}): Promise<AgentPresenceSnapshot> {
  const admin = createTelephonyAdminClient()
  const { error } = await admin.rpc('set_agent_call_activity', {
    target_organization: input.organizationId, target_user: input.userId, target_state: input.state,
    target_call: input.callId ?? null, wrap_up_seconds: input.wrapUpSeconds ?? 30,
    target_metadata: { source: 'dialer' },
  })
  if (error) throw new Error(`Unable to update call activity: ${error.message}`)
  return getAgentPresence(input.organizationId, input.userId)
}
