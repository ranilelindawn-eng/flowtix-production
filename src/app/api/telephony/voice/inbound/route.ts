import twilio from 'twilio'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  const called = form.get('To') ?? ''
  const from = form.get('From') ?? ''
  const providerCallSid = form.get('CallSid')
  const admin = createTelephonyAdminClient()
  const response = new twilio.twiml.VoiceResponse()

  const { data: ownedNumber } = await admin
    .from('organization_phone_numbers')
    .select('organization_id, phone_number')
    .eq('phone_number', called)
    .eq('provider', 'twilio')
    .maybeSingle()

  if (!ownedNumber) {
    response.say('This Flowtix number is not configured.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  let config
  try {
    config = await getOrganizationTwilioConfiguration(ownedNumber.organization_id, called)
  } catch (error) {
    response.say(error instanceof Error ? error.message : 'This workspace calling provider is unavailable.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  if (!validateTwilioWebhook(request, form, config.authToken)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { data: routingNumber } = await admin
    .from('phone_numbers')
    .select('ring_group_id, queue_id')
    .eq('organization_id', ownedNumber.organization_id)
    .eq('phone_number', called)
    .eq('is_active', true)
    .maybeSingle()

  const owner = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', ownedNumber.organization_id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()

  const { data: call } = await admin
    .from('calls')
    .insert({
      organization_id: ownedNumber.organization_id,
      direction: 'inbound',
      status: 'ringing',
      started_at: new Date().toISOString(),
      recording_available: false,
      provider: 'twilio',
      provider_call_sid: providerCallSid,
      from_number: from,
      to_number: called,
      metadata: { source: 'inbound_number' },
      created_by: owner.data?.user_id,
    })
    .select('id')
    .single()

  const callbackBase = `${config.publicUrl}/api/telephony`
  const callbackOrg = `organizationId=${encodeURIComponent(ownedNumber.organization_id)}`
  const dial = response.dial({
    timeout: 25,
    answerOnBridge: true,
    record: 'record-from-answer-dual',
    recordingStatusCallback: `${callbackBase}/recording?${callbackOrg}`,
    recordingStatusCallbackMethod: 'POST',
  })

  let userIds: string[] = []
  if (routingNumber?.ring_group_id) {
    const { data } = await admin.from('ring_group_members').select('user_id').eq('ring_group_id', routingNumber.ring_group_id).eq('is_active', true).order('priority')
    userIds = (data ?? []).map((item) => item.user_id)
  } else if (routingNumber?.queue_id) {
    const { data } = await admin.from('queue_members').select('user_id').eq('queue_id', routingNumber.queue_id).eq('is_active', true).order('priority')
    userIds = (data ?? []).map((item) => item.user_id)
  } else {
    const { data } = await admin.from('organization_members').select('user_id').eq('organization_id', ownedNumber.organization_id).eq('status', 'active').limit(10)
    userIds = (data ?? []).map((item) => item.user_id)
  }

  if (userIds.length === 0) {
    response.say('No agents are currently available. Please try again later.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  for (const userId of userIds.slice(0, 10)) {
    dial.client(
      {
        statusCallback: `${callbackBase}/status?callId=${encodeURIComponent(call?.id ?? '')}&${callbackOrg}`,
        statusCallbackMethod: 'POST',
      },
      `cf_${userId.replace(/-/g, '')}`,
    )
  }

  return twimlResponse(response.toString())
}
