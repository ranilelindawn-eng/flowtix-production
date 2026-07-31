import twilio from 'twilio'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  const to = form.get('To')?.trim() ?? ''
  const userId = form.get('CallFlowUserId')?.trim() ?? ''
  const organizationId = form.get('CallFlowOrganizationId')?.trim() ?? ''
  const contactId = form.get('ContactId')?.trim() || null
  const record = form.get('Record') !== 'false'
  const response = new twilio.twiml.VoiceResponse()

  if (!/^\+[1-9]\d{7,14}$/.test(to) || !userId || !organizationId) {
    response.say('The destination number or workspace information is invalid.')
    return twimlResponse(response.toString())
  }

  const admin = createTelephonyAdminClient()
  const { data: membership } = await admin
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) {
    response.say('Your workspace membership could not be verified.')
    return twimlResponse(response.toString())
  }

  let config
  try {
    config = await getOrganizationTwilioConfiguration(organizationId)
  } catch (error) {
    response.say(error instanceof Error ? error.message : 'Twilio is not configured for this workspace.')
    return twimlResponse(response.toString())
  }

  if (!validateTwilioWebhook(request, form, config.authToken)) {
    return new Response('Forbidden', { status: 403 })
  }

  const providerCallSid = form.get('CallSid')
  const { data: call } = await admin
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

  const callbackBase = `${config.publicUrl}/api/telephony`
  const callbackOrg = `organizationId=${encodeURIComponent(organizationId)}`
  const dial = response.dial({
    callerId: config.callerId,
    answerOnBridge: true,
    record: record ? 'record-from-answer-dual' : undefined,
    recordingStatusCallback: record ? `${callbackBase}/recording?${callbackOrg}` : undefined,
    recordingStatusCallbackMethod: 'POST',
  })

  dial.number(
    {
      statusCallback: `${callbackBase}/status?callId=${encodeURIComponent(call?.id ?? '')}&${callbackOrg}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    },
    to,
  )

  return twimlResponse(response.toString())
}
