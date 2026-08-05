import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import {
  createSupervisorSession,
  getOrCreateCallControlSession,
  recordCallControlEvent,
} from '@/lib/telephony/control/service'
import type { SupervisorMode } from '@/lib/telephony/control/types'

type RequestBody = { callId?: string; mode?: SupervisorMode; supervisorIdentity?: string }
type CallRow = { id: string; provider_call_sid: string | null; provider_child_call_sid: string | null; provider: string | null }

function supervisorTwiml(input: { conferenceName: string; mode: SupervisorMode; coachedCallSid?: string | null }): string {
  if (input.mode === 'monitor') {
    return `<Response><Dial><Conference muted="true" startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${input.conferenceName}</Conference></Dial></Response>`
  }
  if (input.mode === 'whisper') {
    if (!input.coachedCallSid) throw new Error('The agent participant is unavailable for whisper mode.')
    return `<Response><Dial><Conference coach="${input.coachedCallSid}" startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${input.conferenceName}</Conference></Dial></Response>`
  }
  return `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${input.conferenceName}</Conference></Dial></Response>`
}

export async function POST(request: Request) {
  const body = await request.json() as RequestBody
  const organization = await getCurrentOrganization()
  if (!organization || !body.callId || !body.mode || !['monitor', 'whisper', 'barge'].includes(body.mode) || !body.supervisorIdentity) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (organization.role === 'agent') {
    return NextResponse.json({ error: 'Supervisor call controls require manager, administrator, or owner access.' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data } = await supabase.from('calls')
    .select('id,provider_call_sid,provider_child_call_sid,provider')
    .eq('organization_id', organization.organization_id)
    .or(`id.eq.${body.callId},provider_call_sid.eq.${body.callId},provider_child_call_sid.eq.${body.callId}`)
    .maybeSingle()
  const call = data as CallRow | null
  if (!call) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
  if ((call.provider ?? 'twilio') !== 'twilio') {
    return NextResponse.json({ error: 'Supervisor controls are not yet supported by this provider.' }, { status: 409 })
  }

  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const client = twilio(config.accountSid, config.authToken)
  const session = await getOrCreateCallControlSession({ organizationId: organization.organization_id, callId: call.id })
  if (!session.conferenceName) return NextResponse.json({ error: 'Conference mode is unavailable.' }, { status: 409 })

  try {
    const activeSid = call.provider_child_call_sid ?? call.provider_call_sid
    if (activeSid) {
      await client.calls(activeSid).update({
        twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${session.conferenceName}</Conference></Dial></Response>`,
      })
    }

    const conferences = await client.conferences.list({ friendlyName: session.conferenceName, status: 'in-progress', limit: 1 })
    const conference = conferences[0]
    let coachedCallSid: string | null = null
    if (conference) {
      const participants = await client.conferences(conference.sid).participants.list({ limit: 100 })
      coachedCallSid = participants.find((participant) => participant.callSid === activeSid)?.callSid ?? null
    }

    const supervisorCall = await client.calls.create({
      to: `client:${body.supervisorIdentity.replace(/[^a-zA-Z0-9_]/g, '')}`,
      from: config.callerId,
      twiml: supervisorTwiml({ conferenceName: session.conferenceName, mode: body.mode, coachedCallSid }),
    })
    const supervisorSessionId = await createSupervisorSession({
      organizationId: organization.organization_id,
      callId: call.id,
      supervisorUserId: organization.user_id,
      mode: body.mode,
      providerCallSid: supervisorCall.sid,
      conferenceName: session.conferenceName,
    })
    await recordCallControlEvent({
      organizationId: organization.organization_id,
      callId: call.id,
      sessionId: session.id,
      actorUserId: organization.user_id,
      action: body.mode,
      providerRequestId: supervisorCall.sid,
    })
    return NextResponse.json({ success: true, supervisorSessionId, providerCallSid: supervisorCall.sid })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start supervisor control.' }, { status: 409 })
  }
}
