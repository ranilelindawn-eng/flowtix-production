import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getTwilioConfiguration } from '@/lib/telephony/config'

export async function POST(request: Request) {
  const body = await request.json() as { callId?: string; action?: 'hold'|'resume'|'hangup'|'start-recording'|'stop-recording'; recordingSid?: string }
  const organization = await getCurrentOrganization()
  if (!organization || !body.callId || !body.action) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const supabase = await createClient()
  const { data: call } = await supabase.from('calls').select('provider_call_sid, provider_child_call_sid').eq('organization_id', organization.organization_id).or(`id.eq.${body.callId},provider_call_sid.eq.${body.callId},provider_child_call_sid.eq.${body.callId}`).maybeSingle()
  if (!call) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
  const config = getTwilioConfiguration()
  const client = twilio(config.accountSid, config.authToken)
  const sid = call.provider_child_call_sid ?? call.provider_call_sid
  if (!sid) return NextResponse.json({ error: 'Provider call SID is unavailable.' }, { status: 409 })

  if (body.action === 'hangup') await client.calls(sid).update({ status: 'completed' })
  if (body.action === 'hold') await client.calls(sid).update({ twiml: '<Response><Pause length="3600"/></Response>' })
  if (body.action === 'resume') return NextResponse.json({ error: 'Resume requires conference mode; use the browser hold control for a standard call.' }, { status: 409 })
  if (body.action === 'start-recording') await client.calls(sid).recordings.create({ recordingChannels: 'dual', recordingStatusCallback: `${config.publicUrl}/api/telephony/recording` })
  if (body.action === 'stop-recording') {
    if (!body.recordingSid) return NextResponse.json({ error: 'recordingSid is required.' }, { status: 400 })
    await client.calls(sid).recordings(body.recordingSid).update({ status: 'stopped' })
  }
  return NextResponse.json({ success: true })
}
