import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'

export async function POST(request: Request) {
  const body = await request.json() as { callId?: string; target?: string }
  const organization = await getCurrentOrganization()
  if (!organization || !body.callId || !body.target) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const supabase = await createClient()
  const { data: call } = await supabase.from('calls').select('provider_child_call_sid, provider_call_sid, owner_user_id').eq('organization_id', organization.organization_id).or(`id.eq.${body.callId},provider_call_sid.eq.${body.callId},provider_child_call_sid.eq.${body.callId}`).maybeSingle()
  if (call?.owner_user_id && call.owner_user_id !== organization.user_id && organization.role === 'agent') {
    return NextResponse.json({ error: 'Only the call owner or a manager can transfer this call.' }, { status: 403 })
  }
  const sid = call?.provider_child_call_sid ?? call?.provider_call_sid
  if (!sid) return NextResponse.json({ error: 'Active call not found.' }, { status: 404 })
  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const target = body.target.trim()
  const twiml = /^\+[1-9]\d{7,14}$/.test(target)
    ? `<Response><Dial callerId="${config.callerId}"><Number>${target}</Number></Dial></Response>`
    : `<Response><Dial><Client>${target.replace(/[^a-zA-Z0-9_]/g, '')}</Client></Dial></Response>`
  await twilio(config.accountSid, config.authToken).calls(sid).update({ twiml })
  return NextResponse.json({ success: true })
}
