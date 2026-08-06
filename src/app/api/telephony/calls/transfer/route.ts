import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@/lib/supabase/server'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { hasPermission } from '@/lib/permissions'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import {
  getOrCreateCallControlSession,
  recordCallControlEvent,
  updateCallControlSession,
} from '@/lib/telephony/control/service'

type TransferMode = 'blind' | 'warm'
type RequestBody = { callId?: string; target?: string; mode?: TransferMode }
type CallRow = {
  id: string
  provider_child_call_sid: string | null
  provider_call_sid: string | null
  owner_user_id: string | null
  provider: string | null
}

function targetTwiml(target: string, callerId: string): string {
  return /^\+[1-9]\d{7,14}$/.test(target)
    ? `<Response><Dial callerId="${callerId}"><Number>${target}</Number></Dial></Response>`
    : `<Response><Dial><Client>${target.replace(/[^a-zA-Z0-9_]/g, '')}</Client></Dial></Response>`
}

function conferenceTwiml(name: string): string {
  return `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${name}</Conference></Dial></Response>`
}

export async function POST(request: Request) {
  const body = await request.json() as RequestBody
  const organization = await getCurrentOrganization()
  if (!organization) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (!hasPermission(organization.role, 'calls.update')) return NextResponse.json({ error: 'You do not have permission to control calls.' }, { status: 403 })
  try {
    await assertEntitlement('dialer.cloud', organization.organization_id)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Calling is unavailable.' }, { status: isEntitlementError(error) ? 403 : 500 })
  }
  const mode = body.mode ?? 'blind'
  if (!body.callId || !body.target || !['blind', 'warm'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data } = await supabase.from('calls')
    .select('id,provider_child_call_sid,provider_call_sid,owner_user_id,provider')
    .eq('organization_id', organization.organization_id)
    .or(`id.eq.${body.callId},provider_call_sid.eq.${body.callId},provider_child_call_sid.eq.${body.callId}`)
    .maybeSingle()
  const call = data as CallRow | null

  if (call?.owner_user_id && call.owner_user_id !== organization.user_id && organization.role === 'agent') {
    return NextResponse.json({ error: 'Only the call owner or a manager can transfer this call.' }, { status: 403 })
  }
  const sid = call?.provider_child_call_sid ?? call?.provider_call_sid
  if (!call || !sid) return NextResponse.json({ error: 'Active call not found.' }, { status: 404 })
  if ((call.provider ?? 'twilio') !== 'twilio') {
    return NextResponse.json({ error: 'Transfers for this provider are not yet available.' }, { status: 409 })
  }

  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const client = twilio(config.accountSid, config.authToken)
  const target = body.target.trim()
  const session = await getOrCreateCallControlSession({ organizationId: organization.organization_id, callId: call.id })

  try {
    if (mode === 'blind') {
      await client.calls(sid).update({ twiml: targetTwiml(target, config.callerId) })
      await updateCallControlSession({ organizationId: organization.organization_id, callId: call.id, values: { state: 'transferring' } })
    } else {
      if (!session.conferenceName) throw new Error('Conference name is unavailable.')
      const twiml = conferenceTwiml(session.conferenceName)
      await client.calls(sid).update({ twiml })
      const consultCall = await client.calls.create({
        to: /^\+[1-9]\d{7,14}$/.test(target) ? target : `client:${target.replace(/[^a-zA-Z0-9_]/g, '')}`,
        from: config.callerId,
        twiml,
        statusCallback: `${config.publicUrl}/api/telephony/status?organizationId=${encodeURIComponent(organization.organization_id)}&callId=${encodeURIComponent(call.id)}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      })
      await updateCallControlSession({
        organizationId: organization.organization_id,
        callId: call.id,
        values: { state: 'transferring', consult_participant_sid: consultCall.sid },
      })
    }

    await recordCallControlEvent({
      organizationId: organization.organization_id,
      callId: call.id,
      sessionId: session.id,
      actorUserId: organization.user_id,
      action: mode === 'warm' ? 'warm-transfer' : 'blind-transfer',
      metadata: { target },
    })
    return NextResponse.json({ success: true, mode, conferenceName: session.conferenceName })
  } catch (error) {
    await recordCallControlEvent({
      organizationId: organization.organization_id,
      callId: call.id,
      sessionId: session.id,
      actorUserId: organization.user_id,
      action: mode === 'warm' ? 'warm-transfer' : 'blind-transfer',
      status: 'failed',
      metadata: { target, message: error instanceof Error ? error.message : 'Unknown transfer error.' },
    }).catch(() => undefined)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to transfer the call.' }, { status: 409 })
  }
}
