import 'server-only'

import { retrievePayMongoCheckoutSession } from '@/lib/paymongo/client'
import { createAdminClient } from '@/lib/supabase/admin'

type PayMongoMetadata = {
  organization_id?: string
  plan_code?: string
  checkout_id?: string
  billing_provider?: string
}

type PayMongoPayment = {
  id?: string
  type?: string
  attributes?: {
    amount?: number
    currency?: string
    status?: string
    failed_code?: string
    failed_message?: string
    metadata?: PayMongoMetadata
  }
}

export type PayMongoWebhookBody = {
  data?: {
    id?: string
    attributes?: {
      type?: string
      livemode?: boolean
      created_at?: number | string
      data?: {
        id?: string
        type?: string
        attributes?: {
          amount?: number
          currency?: string
          status?: string
          metadata?: PayMongoMetadata
          payments?: PayMongoPayment[]
          payment_intent?: {
            id?: string
            attributes?: {
              amount?: number
              currency?: string
              status?: string
              metadata?: PayMongoMetadata
              payments?: PayMongoPayment[]
            }
          }
        }
      }
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHECKOUT_PAID_EVENT = 'checkout_session.payment.paid'
const PAYMENT_PAID_EVENT = 'payment.paid'

const cleanText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

function cleanAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function retrieveCheckoutPayment(checkoutId: string) {
  const retryDelays = [0, 300, 900]

  for (const delay of retryDelays) {
    if (delay > 0) await sleep(delay)

    try {
      const checkout = await retrievePayMongoCheckoutSession(checkoutId)
      const payment = checkout.payments[0]
      if (payment?.id) {
        return {
          payment,
          metadata: checkout.metadata,
          status: checkout.status,
        }
      }
    } catch (error) {
      console.error('PAYMONGO CHECKOUT ENRICHMENT ERROR:', error)
      return null
    }
  }

  return null
}

export async function processPayMongoWebhookBody(
  body: PayMongoWebhookBody,
  signatureTimestamp: string,
) {
  const startedAt = Date.now()
  const eventId = cleanText(body.data?.id)
  const eventType = cleanText(body.data?.attributes?.type)?.toLowerCase() ?? 'unknown'
  const resource = body.data?.attributes?.data
  const resourceType = cleanText(resource?.type)?.toLowerCase()
  const resourceId = cleanText(resource?.id)
  const resourceAttributes = resource?.attributes
  const paymentIntentAttributes = resourceAttributes?.payment_intent?.attributes

  let metadata: PayMongoMetadata = {
    ...(paymentIntentAttributes?.metadata ?? {}),
    ...(resourceAttributes?.metadata ?? {}),
  }

  let payments =
    resourceAttributes?.payments ?? paymentIntentAttributes?.payments ?? []
  let payment: PayMongoPayment | undefined
  let checkoutId: string | null = null

  if (eventType === PAYMENT_PAID_EVENT || resourceType === 'payment') {
    payment = resource as PayMongoPayment
    checkoutId = cleanText(metadata.checkout_id)
  } else {
    checkoutId = resourceId
    payment = payments[0]

    if (eventType === CHECKOUT_PAID_EVENT && checkoutId && !payment?.id) {
      const enriched = await retrieveCheckoutPayment(checkoutId)
      if (enriched) {
        payment = enriched.payment
        payments = [enriched.payment]
        metadata = { ...enriched.metadata, ...metadata }
      }
    }
  }

  const paymentAttributes = payment?.attributes
  const organizationText = cleanText(
    metadata.organization_id ?? paymentAttributes?.metadata?.organization_id,
  )
  const organizationId =
    organizationText && UUID_PATTERN.test(organizationText)
      ? organizationText
      : null

  if (!eventId) {
    throw new Error('Webhook event ID is required.')
  }

  const paymentAmount = cleanAmount(paymentAttributes?.amount)
  const resourceAmount = cleanAmount(resourceAttributes?.amount)
  const paymentIntentAmount = cleanAmount(paymentIntentAttributes?.amount)
  const admin = createAdminClient()

  try {
    const { data, error } = await admin.rpc('process_paymongo_lifecycle_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_livemode: body.data?.attributes?.livemode ?? null,
      p_signature_timestamp: signatureTimestamp,
      p_resource_type: resourceType ?? null,
      p_resource_id: resourceId,
      p_organization_id: organizationId,
      p_checkout_id: checkoutId,
      p_payment_id: cleanText(payment?.id),
      p_plan_code: cleanText(
        metadata.plan_code ?? paymentAttributes?.metadata?.plan_code,
      ),
      p_amount: paymentAmount ?? resourceAmount ?? paymentIntentAmount,
      p_currency:
        cleanText(paymentAttributes?.currency) ??
        cleanText(resourceAttributes?.currency) ??
        cleanText(paymentIntentAttributes?.currency),
      p_payment_status:
        cleanText(paymentAttributes?.status) ??
        cleanText(resourceAttributes?.status) ??
        cleanText(paymentIntentAttributes?.status),
      p_failure_code: cleanText(paymentAttributes?.failed_code),
      p_failure_message: cleanText(paymentAttributes?.failed_message),
      p_payload: body,
    })

    if (error) {
      throw new Error(error.message)
    }

    const status = typeof data?.status === 'string' ? data.status : 'failed'

if (status !== 'processed' && status !== 'ignored') {
  const reason =
    typeof data?.reason === 'string' ? data.reason : 'processing_error'

  const diagnostic =
    typeof data?.error === 'string' && data.error.trim().length > 0
      ? ` ${data.error.trim()}`
      : ''

  throw new Error(
    `PayMongo lifecycle processing failed: ${reason}.${diagnostic}`,
  )
}

    const outcome = status === 'ignored' ? 'ignored' : 'processed'
    const { error: attemptError } = await admin.rpc(
      'mark_billing_webhook_attempt',
      {
        p_event_id: eventId,
        p_outcome: outcome,
        p_error: null,
        p_duration_ms: Date.now() - startedAt,
      },
    )
    if (attemptError) {
      throw new Error(attemptError.message)
    }

    return { eventId, eventType, result: data ?? {} }
  } catch (error) {
    try {
      await admin.rpc('mark_billing_webhook_attempt', {
        p_event_id: eventId,
        p_outcome: 'failed',
        p_error:
          error instanceof Error
            ? error.message
            : 'Unknown webhook processing error.',
        p_duration_ms: Date.now() - startedAt,
      })
    } catch {
      // Preserve the original processing error if attempt logging also fails.
    }
    throw error
  }
}
