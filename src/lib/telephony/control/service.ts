import 'server-only'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import type { CallControlSession, SupervisorMode } from './types'

type SessionRow = {
  id: string
  organization_id: string
  call_id: string
  provider: string
  conference_name: string | null
  conference_sid: string | null
  customer_participant_sid: string | null
  agent_participant_sid: string | null
  consult_participant_sid: string | null
  state: string
}

function mapSession(row: SessionRow): CallControlSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    callId: row.call_id,
    provider: row.provider,
    conferenceName: row.conference_name,
    conferenceSid: row.conference_sid,
    customerParticipantSid: row.customer_participant_sid,
    agentParticipantSid: row.agent_participant_sid,
    consultParticipantSid: row.consult_participant_sid,
    state: row.state,
  }
}

export async function getOrCreateCallControlSession(input: {
  organizationId: string
  callId: string
  provider?: string
}): Promise<CallControlSession> {
  const admin = createTelephonyAdminClient()
  const conferenceName = `flowtix-${input.organizationId}-${input.callId}`.replace(/[^a-zA-Z0-9_-]/g, '')
  const { data, error } = await admin
    .from('call_control_sessions')
    .upsert({
      organization_id: input.organizationId,
      call_id: input.callId,
      provider: input.provider ?? 'signalwire',
      conference_name: conferenceName,
      state: 'preparing',
    }, { onConflict: 'organization_id,call_id' })
    .select('id,organization_id,call_id,provider,conference_name,conference_sid,customer_participant_sid,agent_participant_sid,consult_participant_sid,state')
    .single()

  if (error) throw new Error(`Unable to create call-control session: ${error.message}`)
  return mapSession(data as SessionRow)
}

export async function updateCallControlSession(input: {
  organizationId: string
  callId: string
  values: Record<string, unknown>
}) {
  const admin = createTelephonyAdminClient()
  const { error } = await admin
    .from('call_control_sessions')
    .update({ ...input.values, updated_at: new Date().toISOString() })
    .eq('organization_id', input.organizationId)
    .eq('call_id', input.callId)
  if (error) throw new Error(`Unable to update call-control session: ${error.message}`)
}

export async function recordCallControlEvent(input: {
  organizationId: string
  callId: string
  sessionId?: string | null
  actorUserId?: string | null
  action: string
  status?: string
  providerRequestId?: string | null
  metadata?: Record<string, unknown>
}) {
  const admin = createTelephonyAdminClient()
  const { error } = await admin.from('call_control_events').insert({
    organization_id: input.organizationId,
    call_id: input.callId,
    control_session_id: input.sessionId ?? null,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    status: input.status ?? 'completed',
    provider_request_id: input.providerRequestId ?? null,
    metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Unable to record call-control event: ${error.message}`)
}

export async function createSupervisorSession(input: {
  organizationId: string
  callId: string
  supervisorUserId: string
  mode: SupervisorMode
  providerCallSid?: string | null
  conferenceName?: string | null
  metadata?: Record<string, unknown>
}) {
  const admin = createTelephonyAdminClient()
  const { data, error } = await admin.from('call_supervisor_sessions').insert({
    organization_id: input.organizationId,
    call_id: input.callId,
    supervisor_user_id: input.supervisorUserId,
    mode: input.mode,
    provider_call_sid: input.providerCallSid ?? null,
    conference_name: input.conferenceName ?? null,
    status: 'connecting',
    metadata: input.metadata ?? {},
  }).select('id').single()
  if (error) throw new Error(`Unable to create supervisor session: ${error.message}`)
  return data.id as string
}
