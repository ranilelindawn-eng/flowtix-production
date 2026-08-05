import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type PayMongoWebhookBody = {
  data?: {
    id?: string
    attributes?: {
      type?: string
      livemode?: boolean
      data?: {
        id?: string
        type?: string
        attributes?: {
          amount?: number
          currency?: string
          status?: string
          metadata?: { organization_id?: string; plan_code?: string }
          payments?: Array<{ id?: string; attributes?: { amount?: number; currency?: string; status?: string; failed_code?: string; failed_message?: string } }>
          payment_intent?: { attributes?: { payments?: Array<{ id?: string; attributes?: { amount?: number; currency?: string; status?: string; failed_code?: string; failed_message?: string } }> } }
        }
      }
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const cleanText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

export async function processPayMongoWebhookBody(body: PayMongoWebhookBody, signatureTimestamp: string) {
  const startedAt = Date.now()
  const eventId = cleanText(body.data?.id)
  const eventType = cleanText(body.data?.attributes?.type) ?? 'unknown'
  const resource = body.data?.attributes?.data
  const metadata = resource?.attributes?.metadata
  const organizationText = cleanText(metadata?.organization_id)
  const organizationId = organizationText && UUID_PATTERN.test(organizationText) ? organizationText : null
  const payments = resource?.attributes?.payments ?? resource?.attributes?.payment_intent?.attributes?.payments ?? []
  const payment = payments[0]
  const paymentAttributes = payment?.attributes
  if (!eventId) throw new Error('Webhook event ID is required.')

  const admin = createAdminClient()
  try {
    const { data, error } = await admin.rpc('process_paymongo_lifecycle_event', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_livemode: body.data?.attributes?.livemode ?? null,
      p_signature_timestamp: signatureTimestamp,
      p_resource_type: cleanText(resource?.type),
      p_resource_id: cleanText(resource?.id),
      p_organization_id: organizationId,
      p_checkout_id: cleanText(resource?.id),
      p_payment_id: cleanText(payment?.id),
      p_plan_code: cleanText(metadata?.plan_code),
      p_amount: typeof paymentAttributes?.amount === 'number' ? paymentAttributes.amount : typeof resource?.attributes?.amount === 'number' ? resource.attributes.amount : null,
      p_currency: cleanText(paymentAttributes?.currency) ?? cleanText(resource?.attributes?.currency),
      p_payment_status: cleanText(paymentAttributes?.status) ?? cleanText(resource?.attributes?.status),
      p_failure_code: cleanText(paymentAttributes?.failed_code),
      p_failure_message: cleanText(paymentAttributes?.failed_message),
      p_payload: body,
    })
    if (error) throw new Error(error.message)
    const outcome = data?.status === 'ignored' ? 'ignored' : data?.status === 'failed' ? 'failed' : 'processed'
    await admin.rpc('mark_billing_webhook_attempt', {
      p_event_id: eventId,
      p_outcome: outcome,
      p_error: outcome === 'failed' ? 'Lifecycle processor returned failed.' : null,
      p_duration_ms: Date.now() - startedAt,
    })
    return { eventId, eventType, result: data ?? {} }
  } catch (error) {
    try {
      await admin.rpc('mark_billing_webhook_attempt', {
        p_event_id: eventId,
        p_outcome: 'failed',
        p_error: error instanceof Error ? error.message : 'Unknown webhook processing error.',
        p_duration_ms: Date.now() - startedAt,
      })
    } catch {
      // Preserve the original webhook processing error if attempt logging also fails.
    }
    throw error
  }
}
