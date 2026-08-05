import twilio from 'twilio'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { createInboundRoute } from '@/lib/telephony/routing/engine'
import type { RoutingTarget } from '@/lib/telephony/routing/types'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

type DialTargetWriter = {
  client(options: { statusCallback: string; statusCallbackMethod: 'POST' }, identity: string): unknown
  number(phoneNumber: string): unknown
}

function appendDialTarget(input: {
  dial: DialTargetWriter
  target: RoutingTarget
  callbackBase: string
  callbackQuery: URLSearchParams
}) {
  if (input.target.kind === 'number' && input.target.phoneNumber) {
    input.dial.number(input.target.phoneNumber)
    return
  }
  if (!input.target.userId) return

  const targetQuery = new URLSearchParams(input.callbackQuery)
  targetQuery.set('userId', input.target.userId)
  if (input.target.sourceRingGroupId) {
    targetQuery.set('sourceRingGroupId', input.target.sourceRingGroupId)
  }
  input.dial.client(
    {
      statusCallback: `${input.callbackBase}/status?${targetQuery.toString()}`,
      statusCallbackMethod: 'POST',
    },
    `cf_${input.target.userId.replace(/-/g, '')}`,
  )
}

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
  const overflowTimeout =
    typeof route.metadata.overflowTimeoutSeconds === 'number'
      ? route.metadata.overflowTimeoutSeconds
      : route.timeoutSeconds
  const tiers = new Map<number, RoutingTarget[]>()
  for (const target of route.targets) {
    const tierTargets = tiers.get(target.tier) ?? []
    tierTargets.push(target)
    tiers.set(target.tier, tierTargets)
  }

  for (const [tier, tierTargets] of Array.from(tiers.entries()).sort(
    ([left], [right]) => left - right,
  )) {
    const simultaneous = tier === 0 && route.strategy === 'simultaneous'
    if (simultaneous) {
      const dial = response.dial({
        timeout: route.timeoutSeconds,
        answerOnBridge: true,
        record: 'record-from-answer-dual',
        recordingStatusCallback: `${callbackBase}/recording?organizationId=${encodeURIComponent(ownedNumber.organization_id)}`,
        recordingStatusCallbackMethod: 'POST',
      })
      for (const target of tierTargets.slice(0, 10)) {
        appendDialTarget({ dial, target, callbackBase, callbackQuery })
      }
      continue
    }

    for (const target of tierTargets) {
      const dial = response.dial({
        timeout: tier === 0 ? route.timeoutSeconds : overflowTimeout,
        answerOnBridge: true,
        record: 'record-from-answer-dual',
        recordingStatusCallback: `${callbackBase}/recording?organizationId=${encodeURIComponent(ownedNumber.organization_id)}`,
        recordingStatusCallbackMethod: 'POST',
      })
      appendDialTarget({ dial, target, callbackBase, callbackQuery })
    }
  }

  return twimlResponse(response.toString())
}
