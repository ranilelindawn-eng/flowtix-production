import twilio from 'twilio'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { createInboundRoute } from '@/lib/telephony/routing/engine'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  const called = form.get('To') ?? ''
  const from = form.get('From') ?? ''
  const providerCallSid = form.get('CallSid') ?? ''
  const admin = createTelephonyAdminClient()
  const response = new twilio.twiml.VoiceResponse()

  const { data: ownedNumber } = await admin
    .from('organization_phone_numbers')
    .select('organization_id, phone_number')
    .eq('phone_number', called)
    .eq('provider', 'twilio')
    .maybeSingle()

  if (!ownedNumber || !providerCallSid) {
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

  const owner = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', ownedNumber.organization_id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()

  let route
  try {
    route = await createInboundRoute({
      organizationId: ownedNumber.organization_id,
      provider: 'twilio',
      providerCallId: providerCallSid,
      fromNumber: from,
      toNumber: called,
      createdBy: owner.data?.user_id ?? null,
    })
  } catch (error) {
    console.error('Inbound routing failed:', error)
    response.say('We could not route your call. Please try again later.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  if (route.targets.length === 0) {
    response.say('No agents are currently available. Please try again later.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  const callbackBase = `${config.publicUrl}/api/telephony`
  const callbackQuery = new URLSearchParams({
    callId: route.callId,
    routingAttemptId: route.routingAttemptId,
    organizationId: ownedNumber.organization_id,
  })
  const dial = response.dial({
    timeout: route.timeoutSeconds,
    answerOnBridge: true,
    record: 'record-from-answer-dual',
    recordingStatusCallback: `${callbackBase}/recording?organizationId=${encodeURIComponent(ownedNumber.organization_id)}`,
    recordingStatusCallbackMethod: 'POST',
  })

  for (const target of route.targets.slice(0, 10)) {
    const targetQuery = new URLSearchParams(callbackQuery)
    targetQuery.set('userId', target.userId)
    dial.client(
      {
        statusCallback: `${callbackBase}/status?${targetQuery.toString()}`,
        statusCallbackMethod: 'POST',
      },
      `cf_${target.userId.replace(/-/g, '')}`,
    )
    if (route.strategy === 'sequential') break
  }

  return twimlResponse(response.toString())
}
