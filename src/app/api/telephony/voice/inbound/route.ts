import twilio from 'twilio'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  if (!validateTwilioWebhook(request, form)) return new Response('Forbidden', { status: 403 })

  const called = form.get('To') ?? ''
  const from = form.get('From') ?? ''
  const providerCallSid = form.get('CallSid')
  const admin = createTelephonyAdminClient()
  const response = new twilio.twiml.VoiceResponse()

  const { data: number } = await admin
    .from('phone_numbers')
    .select('organization_id, ring_group_id, queue_id')
    .eq('phone_number', called)
    .eq('is_active', true)
    .maybeSingle()

  if (!number) {
    response.say('This Flowtix number is not configured.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  const { data: call } = await admin
    .from('calls')
    .insert({
      organization_id: number.organization_id,
      direction: 'inbound',
      status: 'ringing',
      started_at: new Date().toISOString(),
      recording_available: false,
      provider: 'twilio',
      provider_call_sid: providerCallSid,
      from_number: from,
      to_number: called,
      metadata: { source: 'inbound_number' },
      created_by: (await admin.from('organization_members').select('user_id').eq('organization_id', number.organization_id).eq('role', 'owner').limit(1).maybeSingle()).data?.user_id,
    })
    .select('id')
    .single()

  const config = getTwilioConfiguration()
  const callbackBase = `${config.publicUrl}/api/telephony`
  const dial = response.dial({
    timeout: 25,
    answerOnBridge: true,
    record: 'record-from-answer-dual',
    recordingStatusCallback: `${callbackBase}/recording`,
    recordingStatusCallbackMethod: 'POST',
  })

  let userIds: string[] = []
  if (number.ring_group_id) {
    const { data } = await admin.from('ring_group_members').select('user_id').eq('ring_group_id', number.ring_group_id).eq('is_active', true).order('priority')
    userIds = (data ?? []).map((item) => item.user_id)
  } else if (number.queue_id) {
    const { data } = await admin.from('queue_members').select('user_id').eq('queue_id', number.queue_id).eq('is_active', true).order('priority')
    userIds = (data ?? []).map((item) => item.user_id)
  } else {
    const { data } = await admin.from('organization_members').select('user_id').eq('organization_id', number.organization_id).eq('status', 'active').limit(10)
    userIds = (data ?? []).map((item) => item.user_id)
  }

  if (userIds.length === 0) {
    response.say('No agents are currently available. Please try again later.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  for (const userId of userIds.slice(0, 10)) {
    dial.client({
      statusCallback: `${callbackBase}/status?callId=${encodeURIComponent(call?.id ?? '')}`,
      statusCallbackMethod: 'POST',
    }, `cf_${userId.replace(/-/g, '')}`)
  }

  return twimlResponse(response.toString())
}
