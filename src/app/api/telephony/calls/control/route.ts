import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import {
  getOrCreateCallControlSession,
  recordCallControlEvent,
  updateCallControlSession,
} from '@/lib/telephony/control/service'
import type { CallControlAction } from '@/lib/telephony/control/types'

const ACTIONS: CallControlAction[] = [
  'hold', 'resume', 'hangup', 'start-recording', 'stop-recording', 'conference',
  'blind-transfer', 'warm-transfer',
]

type RequestBody = {
  callId?: string
  action?: CallControlAction
  recordingSid?: string
}

type CallRow = {
  id: string
  provider_call_sid: string | null
  provider_child_call_sid: string | null
  owner_user_id: string | null
  provider: string | null
}

function conferenceTwiml(name: string): string {
  return `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${name}</Conference></Dial></Response>`
}

export async function POST(request: Request) {
  const body = await request.json() as RequestBody
  const organization = await getCurrentOrganization()
  if (!organization || !body.callId || !body.action || !ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('calls')
    .select('id,provider_call_sid,provider_child_call_sid,owner_user_id,provider')
    .eq('organization_id', organization.organization_id)
    .or(`id.eq.${body.callId},provider_call_sid.eq.${body.callId},provider_child_call_sid.eq.${body.callId}`)
    .maybeSingle()
  const call = data as CallRow | null

  if (!call) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
  if (call.owner_user_id && call.owner_user_id !== organization.user_id && organization.role === 'agent') {
    return NextResponse.json({ error: 'Only the call owner or a manager can control this call.' }, { status: 403 })
  }
  if ((call.provider ?? 'twilio') !== 'twilio') {
    return NextResponse.json({ error: 'This call-control operation is not yet supported by the active provider.' }, { status: 409 })
  }

  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const client = twilio(config.accountSid, config.authToken)
  const sid = call.provider_child_call_sid ?? call.provider_call_sid
  if (!sid) return NextResponse.json({ error: 'Provider call SID is unavailable.' }, { status: 409 })

  const session = await getOrCreateCallControlSession({
    organizationId: organization.organization_id,
    callId: call.id,
    provider: 'twilio',
  })

  try {
    if (body.action === 'hangup') {
      await client.calls(sid).update({ status: 'completed' })
      await updateCallControlSession({ organizationId: organization.organization_id, callId: call.id, values: { state: 'completed' } })
    }

    if (body.action === 'conference') {
      if (!session.conferenceName) throw new Error('Conference name is unavailable.')
      await client.calls(sid).update({ twiml: conferenceTwiml(session.conferenceName) })
      await updateCallControlSession({ organizationId: organization.organization_id, callId: call.id, values: { state: 'active' } })
    }

    if (body.action === 'hold' || body.action === 'resume') {
      if (!session.conferenceName) throw new Error('Conference mode is required before hold or resume.')
      const conferences = await client.conferences.list({ friendlyName: session.conferenceName, status: 'in-progress', limit: 1 })
      const conference = conferences[0]
      if (!conference) throw new Error('The active conference could not be found.')
      const participants = await client.conferences(conference.sid).participants.list({ limit: 100 })
      const participant = participants.find((item) => item.callSid === sid)
      if (!participant) throw new Error('The active call participant could not be found.')
      await client.conferences(conference.sid).participants(participant.callSid).update({ hold: body.action === 'hold' })
      await updateCallControlSession({
        organizationId: organization.organization_id,
        callId: call.id,
        values: {
          conference_sid: conference.sid,
          customer_participant_sid: participant.callSid,
          state: body.action === 'hold' ? 'held' : 'active',
        },
      })
    }

    if (body.action === 'start-recording') {
      await client.calls(sid).recordings.create({
        recordingChannels: 'dual',
        recordingStatusCallback: `${config.publicUrl}/api/telephony/recording?organizationId=${encodeURIComponent(organization.organization_id)}`,
      })
    }

    if (body.action === 'stop-recording') {
      if (!body.recordingSid) return NextResponse.json({ error: 'recordingSid is required.' }, { status: 400 })
      await client.calls(sid).recordings(body.recordingSid).update({ status: 'stopped' })
    }

    await recordCallControlEvent({
      organizationId: organization.organization_id,
      callId: call.id,
      sessionId: session.id,
      actorUserId: organization.user_id,
      action: body.action,
      metadata: { providerCallSid: sid },
    })

    return NextResponse.json({ success: true, sessionId: session.id, conferenceName: session.conferenceName })
  } catch (error) {
    await recordCallControlEvent({
      organizationId: organization.organization_id,
      callId: call.id,
      sessionId: session.id,
      actorUserId: organization.user_id,
      action: body.action,
      status: 'failed',
      metadata: { message: error instanceof Error ? error.message : 'Unknown call-control error.' },
    }).catch(() => undefined)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to control the call.' }, { status: 409 })
  }
}
