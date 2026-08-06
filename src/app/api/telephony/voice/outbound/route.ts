import twilio from 'twilio'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  const to = form.get('To')?.trim() ?? ''
  const userId = form.get('FlowtixUserId')?.trim() ?? ''
  const organizationId = form.get('FlowtixOrganizationId')?.trim() ?? ''
  const contactId = form.get('ContactId')?.trim() || null
  const record = form.get('Record') !== 'false'
  const callerId = form.get('CallerId')?.trim() || null
  const providerCallSid = form.get('CallSid')?.trim() ?? ''
  const response = new twilio.twiml.VoiceResponse()

  if (!/^\+[1-9]\d{7,14}$/.test(to) || !userId || !organizationId || !providerCallSid) {
    response.say('The destination number or workspace information is invalid.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  let config
  try {
    config = await getOrganizationTwilioConfiguration(organizationId, callerId)
  } catch (error) {
    response.say(
      error instanceof Error
        ? error.message
        : 'Twilio is not configured for this workspace.',
    )
    response.hangup()
    return twimlResponse(response.toString())
  }

  if (!validateTwilioWebhook(request, form, config.authToken)) {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = createTelephonyAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    console.error('Unable to validate outbound caller membership:', membershipError)
    response.say('Your workspace membership could not be verified.')
    response.hangup()
    return twimlResponse(response.toString())
  }
  if (!membership) {
    response.say('Your workspace membership could not be verified.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  const { data: existingCall, error: existingCallError } = await admin
    .from('calls')
    .select('id,organization_id,created_by,to_number')
    .eq('provider', 'twilio')
    .eq('provider_call_sid', providerCallSid)
    .maybeSingle()

  if (existingCallError) {
    console.error('Unable to resolve outbound call idempotency record:', existingCallError)
    response.say('We could not initialize this call. Please try again.')
    response.hangup()
    return twimlResponse(response.toString())
  }

  if (
    existingCall &&
    (existingCall.organization_id !== organizationId ||
      existingCall.created_by !== userId ||
      existingCall.to_number !== to)
  ) {
    return new Response('Forbidden', { status: 403 })
  }

  let callId = existingCall?.id ?? null
  if (!callId) {
    const { data: insertedCall, error: insertError } = await admin
      .from('calls')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        direction: 'outbound',
        status: 'ringing',
        started_at: new Date().toISOString(),
        recording_available: false,
        created_by: userId,
        provider: 'twilio',
        provider_call_sid: providerCallSid,
        from_number: config.callerId,
        to_number: to,
        metadata: { source: 'browser_dialer' },
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: racedCall } = await admin
          .from('calls')
          .select('id,organization_id,created_by,to_number')
          .eq('provider', 'twilio')
          .eq('provider_call_sid', providerCallSid)
          .maybeSingle()
        if (
          !racedCall ||
          racedCall.organization_id !== organizationId ||
          racedCall.created_by !== userId ||
          racedCall.to_number !== to
        ) {
          return new Response('Forbidden', { status: 403 })
        }
        callId = racedCall.id
      } else {
        console.error('Unable to create outbound call record:', insertError)
        response.say('We could not initialize this call. Please try again.')
        response.hangup()
        return twimlResponse(response.toString())
      }
    } else {
      callId = insertedCall.id
    }
  }

  const callbackBase = `${config.publicUrl}/api/telephony`
  const callbackOrg = `organizationId=${encodeURIComponent(organizationId)}`
  const dial = response.dial({
    callerId: config.callerId,
    answerOnBridge: true,
    record: record ? 'record-from-answer-dual' : undefined,
    recordingStatusCallback: record
      ? `${callbackBase}/recording?${callbackOrg}`
      : undefined,
    recordingStatusCallbackMethod: 'POST',
  })

  dial.number(
    {
      statusCallback: `${callbackBase}/status?callId=${encodeURIComponent(callId)}&${callbackOrg}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    },
    to,
  )

  return twimlResponse(response.toString())
}
