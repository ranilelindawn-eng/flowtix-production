import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

import { NextResponse } from 'next/server'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'

export const runtime = 'nodejs'

const SIGNATURE_TOLERANCE_SECONDS = 300
const PAYMONGO_PROVIDER = 'paymongo'
const PAID_CHECKOUT_EVENT = 'checkout_session.payment.paid'

type JsonObject = Record<string, unknown>

type PayMongoEvent = {
  id: string
  type: string
  livemode: boolean
  resource: JsonObject
}

type CheckoutMetadata = {
  organizationId: string
  planId: string
  planCode: string
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getObject(
  object: JsonObject,
  key: string,
): JsonObject | null {
  const value = object[key]
  return isObject(value) ? value : null
}

function getString(
  object: JsonObject,
  key: string,
): string | null {
  const value = object[key]
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function getBoolean(
  object: JsonObject,
  key: string,
): boolean {
  return object[key] === true
}

function parseEvent(rawBody: string): PayMongoEvent {
  let parsed: unknown

  try {
    parsed = JSON.parse(rawBody) as unknown
  } catch {
    throw new Error('PayMongo sent an invalid JSON payload.')
  }

  if (!isObject(parsed)) {
    throw new Error('PayMongo sent an invalid event payload.')
  }

  const data = getObject(parsed, 'data')
  const attributes = data ? getObject(data, 'attributes') : null
  const resource = attributes ? getObject(attributes, 'data') : null

  const id = data ? getString(data, 'id') : null
  const eventType = attributes ? getString(attributes, 'type') : null

  if (!id || !eventType || !resource) {
    throw new Error('PayMongo event is missing required fields.')
  }

  return {
    id,
    type: eventType,
    livemode: attributes ? getBoolean(attributes, 'livemode') : false,
    resource,
  }
}

function parseSignatureHeader(
  signatureHeader: string,
): Map<string, string[]> {
  const values = new Map<string, string[]>()

  for (const part of signatureHeader.split(',')) {
    const separatorIndex = part.indexOf('=')

    if (separatorIndex <= 0) continue

    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()

    if (!key || !value) continue

    const existing = values.get(key) ?? []
    existing.push(value)
    values.set(key, existing)
  }

  return values
}

function secureHexEquals(
  expectedHex: string,
  receivedHex: string,
): boolean {
  if (
    !/^[a-f0-9]+$/i.test(expectedHex) ||
    !/^[a-f0-9]+$/i.test(receivedHex)
  ) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const received = Buffer.from(receivedHex, 'hex')

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  )
}

function verifyPayMongoSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  livemode: boolean,
): void {
  const signatureValues = parseSignatureHeader(signatureHeader)
  const timestampString = signatureValues.get('t')?.[0]
  const signatureKey = livemode ? 'li' : 'te'
  const signatures = signatureValues.get(signatureKey) ?? []

  if (!timestampString || signatures.length === 0) {
    throw new Error('PayMongo signature header is incomplete.')
  }

  const timestamp = Number(timestampString)

  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('PayMongo signature timestamp is invalid.')
  }

  const currentTimestamp = Math.floor(Date.now() / 1000)

  if (
    Math.abs(currentTimestamp - timestamp) >
    SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new Error('PayMongo webhook timestamp is outside the allowed window.')
  }

  const signedPayload = `${timestampString}.${rawBody}`
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex')

  const signatureMatches = signatures.some((signature) =>
    secureHexEquals(expectedSignature, signature),
  )

  if (!signatureMatches) {
    throw new Error('PayMongo webhook signature is invalid.')
  }
}

function readCheckoutMetadata(
  resource: JsonObject,
): CheckoutMetadata {
  const attributes = getObject(resource, 'attributes')
  const metadata = attributes
    ? getObject(attributes, 'metadata')
    : null

  if (!metadata) {
    throw new Error('PayMongo Checkout Session is missing metadata.')
  }

  const organizationId = getString(metadata, 'organization_id')
  const planId = getString(metadata, 'plan_id')
  const planCode = getString(metadata, 'plan_code')

  if (!organizationId || !planId || !planCode) {
    throw new Error(
      'PayMongo Checkout Session metadata is incomplete.',
    )
  }

  return {
    organizationId,
    planId,
    planCode,
  }
}

function addOneMonth(date: Date): Date {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + 1)
  return result
}

async function syncPaidCheckout(
  event: PayMongoEvent,
): Promise<{
  organizationId: string
  checkoutSessionId: string
}> {
  const checkoutSessionId = getString(event.resource, 'id')

  if (!checkoutSessionId) {
    throw new Error('PayMongo event is missing the Checkout Session ID.')
  }

  const {
    organizationId,
    planId,
    planCode,
  } = readCheckoutMetadata(event.resource)

  const admin = createTelephonyAdminClient()

  const { data: plan, error: planError } = await admin
    .from('subscription_plans')
    .select('id, code')
    .eq('id', planId)
    .eq('code', planCode)
    .eq('is_active', true)
    .maybeSingle()

  if (planError) {
    throw new Error(
      `Unable to validate the Flowtix plan: ${planError.message}`,
    )
  }

  if (!plan) {
    throw new Error(
      'The PayMongo payment references an invalid Flowtix plan.',
    )
  }

  const { data: organization, error: organizationError } =
    await admin
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .maybeSingle()

  if (organizationError) {
    throw new Error(
      `Unable to validate the Flowtix organization: ${organizationError.message}`,
    )
  }

  if (!organization) {
    throw new Error(
      'The PayMongo payment references an invalid Flowtix organization.',
    )
  }

  const periodStart = new Date()
  const periodEnd = addOneMonth(periodStart)

  const { error: subscriptionError } = await admin
    .from('organization_subscriptions')
    .upsert(
      {
        organization_id: organizationId,
        plan_id: plan.id,
        billing_provider: PAYMONGO_PROVIDER,
        provider_customer_id: null,
        provider_subscription_id: checkoutSessionId,
        status: 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: periodStart.toISOString(),
      },
      {
        onConflict: 'organization_id',
      },
    )

  if (subscriptionError) {
    throw new Error(
      `Unable to update the Flowtix subscription: ${subscriptionError.message}`,
    )
  }

  return {
    organizationId,
    checkoutSessionId,
  }
}

export async function POST(request: Request) {
  const signatureHeader = request.headers.get('paymongo-signature')
  const webhookSecret =
    process.env.PAYMONGO_WEBHOOK_SECRET?.trim()

  if (!signatureHeader || !webhookSecret) {
    return NextResponse.json(
      {
        error: 'PayMongo webhook is not configured.',
      },
      {
        status: 400,
      },
    )
  }

  const rawBody = await request.text()
  let event: PayMongoEvent

  try {
    event = parseEvent(rawBody)

    verifyPayMongoSignature(
      rawBody,
      signatureHeader,
      webhookSecret,
      event.livemode,
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid PayMongo webhook.',
      },
      {
        status: 400,
      },
    )
  }

  try {
    const admin = createTelephonyAdminClient()

    const { data: existingEvent, error: existingEventError } =
      await admin
        .from('subscription_events')
        .select('id')
        .eq('billing_provider', PAYMONGO_PROVIDER)
        .eq('provider_event_id', event.id)
        .maybeSingle()

    if (existingEventError) {
      throw new Error(
        `Unable to check PayMongo webhook history: ${existingEventError.message}`,
      )
    }

    if (existingEvent) {
      return NextResponse.json({
        received: true,
        duplicate: true,
      })
    }

    if (event.type !== PAID_CHECKOUT_EVENT) {
      return NextResponse.json({
        received: true,
        ignored: true,
      })
    }

    const {
      organizationId,
      checkoutSessionId,
    } = await syncPaidCheckout(event)

    const { error: eventInsertError } = await admin
      .from('subscription_events')
      .insert({
        organization_id: organizationId,
        billing_provider: PAYMONGO_PROVIDER,
        provider_event_id: event.id,
        provider_subscription_id: checkoutSessionId,
        event_type: event.type,
        payload: {
          livemode: event.livemode,
          checkout_session_id: checkoutSessionId,
        },
      })

    if (eventInsertError) {
      if (eventInsertError.code === '23505') {
        return NextResponse.json({
          received: true,
          duplicate: true,
        })
      }

      throw new Error(
        `Unable to record the PayMongo event: ${eventInsertError.message}`,
      )
    }

    return NextResponse.json({
      received: true,
    })
  } catch (error) {
    console.error('PayMongo webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      error,
    })

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'PayMongo webhook processing failed.',
      },
      {
        status: 500,
      },
    )
  }
}