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

const MAX_TWILIO_DIAL_TARGETS = 10
const MAX_PROVIDER_CALL_ID_LENGTH = 128

function normalizeE164(value: string): string | null {
  const normalized = value.trim()
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

function appendDialTarget(input: {
  dial: DialTargetWriter
  target: RoutingTarget
  callbackBase: string
  callbackQuery: URLSearchParams
}) {
  if (input.target.kind === 'number' && input.target.phoneNumber) {
    const phoneNumber = normalizeE164(input.target.phoneNumber)
    if (phoneNumber) input.dial.number(phoneNumber)
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

function unavailableResponse(message: string) {
  const response = new twilio.twiml.VoiceResponse()
  response.say(message)
  response.hangup()
  return twimlResponse(response.toString())
}

export async function POST(request: Request) {
  let form: URLSearchParams
  try {
    form = await parseTwilioForm(request)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const called = normalizeE164(form.get('To') ?? '')
  const from = normalizeE164(form.get('From') ?? '')
  const providerCallSid = (form.get('CallSid') ?? '').trim()
  if (!called || !from || !providerCallSid || providerCallSid.length > MAX_PROVIDER_CALL_ID_LENGTH) {
    return unavailableResponse('This call request is invalid.')
  }

  const admin = createTelephonyAdminClient()
  const { data: ownedNumber, error: ownedNumberError } = await admin
    .from('organization_phone_numbers')
    .select('organization_id,phone_number,capabilities,recording_enabled')
    .eq('phone_number', called)
    .eq('provider', 'twilio')
    .maybeSingle()

  if (ownedNumberError) {
    console.error('Unable to resolve inbound Twilio number:', ownedNumberError)
    return unavailableResponse('This calling service is temporarily unavailable.')
  }

  const capabilities =
    ownedNumber?.capabilities && typeof ownedNumber.capabilities === 'object'
      ? (ownedNumber.capabilities as Record<string, unknown>)
      : {}

  if (!ownedNumber || capabilities.voice === false) {
    return unavailableResponse('This Flowtix number is not configured for voice calls.')
  }

  let config
  try {
    config = await getOrganizationTwilioConfiguration(ownedNumber.organization_id, called)
  } catch (error) {
    console.error('Unable to load inbound Twilio configuration:', error)
    return unavailableResponse('This workspace calling provider is temporarily unavailable.')
  }

  if (!validateTwilioWebhook(request, form, config.authToken)) {
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  }

  const owner = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', ownedNumber.organization_id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (owner.error) {
    console.error('Unable to resolve workspace owner for inbound call:', owner.error)
    return unavailableResponse('This calling service is temporarily unavailable.')
  }

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
    return unavailableResponse('We could not route your call. Please try again later.')
  }

  const response = new twilio.twiml.VoiceResponse()
  const callbackBase = `${config.publicUrl}/api/telephony`

  if (route.routeType === 'queue' && route.queueId) {
    if (!route.queueAccepted) {
      const overflowNumber =
        typeof route.metadata.overflowNumber === 'string'
          ? normalizeE164(route.metadata.overflowNumber)
          : null
      if (overflowNumber) {
        response.dial({ timeout: 25, answerOnBridge: true }, overflowNumber)
      } else {
        response.say('The call queue is currently full. Please try again later.')
        response.hangup()
      }
      return twimlResponse(response.toString())
    }

    const queueName = `flowtix_${ownedNumber.organization_id.replace(/-/g, '')}_${route.queueId.replace(/-/g, '')}`
    const queueQuery = new URLSearchParams({
      organizationId: ownedNumber.organization_id,
      callId: route.callId,
      routingAttemptId: route.routingAttemptId,
      queueId: route.queueId,
    })
    if (route.queueEntryId) queueQuery.set('queueEntryId', route.queueEntryId)
    response.enqueue(
      {
        waitUrl: `${callbackBase}/queue/wait?${queueQuery.toString()}`,
        waitUrlMethod: 'POST',
        action: `${callbackBase}/queue/action?${queueQuery.toString()}`,
        method: 'POST',
      },
      queueName,
    )
    return twimlResponse(response.toString())
  }

  if (route.targets.length === 0) {
    return unavailableResponse('No agents are currently available. Please try again later.')
  }

  const callbackQuery = new URLSearchParams({
    callId: route.callId,
    routingAttemptId: route.routingAttemptId,
    organizationId: ownedNumber.organization_id,
  })
  const overflowTimeout =
    typeof route.metadata.overflowTimeoutSeconds === 'number'
      ? Math.min(Math.max(route.metadata.overflowTimeoutSeconds, 5), 120)
      : route.timeoutSeconds
  const tiers = new Map<number, RoutingTarget[]>()
  for (const target of route.targets) {
    if (!Number.isInteger(target.tier) || target.tier < 0 || target.tier > 5) continue
    const tierTargets = tiers.get(target.tier) ?? []
    tierTargets.push(target)
    tiers.set(target.tier, tierTargets)
  }

  const recordingOptions = ownedNumber.recording_enabled
    ? {
        record: 'record-from-answer-dual' as const,
        recordingStatusCallback: `${callbackBase}/recording?organizationId=${encodeURIComponent(ownedNumber.organization_id)}`,
        recordingStatusCallbackMethod: 'POST' as const,
      }
    : {}

  for (const [tier, tierTargets] of Array.from(tiers.entries()).sort(
    ([left], [right]) => left - right,
  )) {
    const simultaneous = tier === 0 && route.strategy === 'simultaneous'
    if (simultaneous) {
      const dial = response.dial({
        timeout: Math.min(Math.max(route.timeoutSeconds, 5), 120),
        answerOnBridge: true,
        ...recordingOptions,
      })
      for (const target of tierTargets.slice(0, MAX_TWILIO_DIAL_TARGETS)) {
        appendDialTarget({ dial, target, callbackBase, callbackQuery })
      }
      continue
    }

    for (const target of tierTargets.slice(0, MAX_TWILIO_DIAL_TARGETS)) {
      const dial = response.dial({
        timeout: tier === 0 ? Math.min(Math.max(route.timeoutSeconds, 5), 120) : overflowTimeout,
        answerOnBridge: true,
        ...recordingOptions,
      })
      appendDialTarget({ dial, target, callbackBase, callbackQuery })
    }
  }

  return twimlResponse(response.toString())
}
