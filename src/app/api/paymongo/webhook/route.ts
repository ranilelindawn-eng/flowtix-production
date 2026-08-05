import { NextResponse } from 'next/server'

import { verifyPayMongoSignature } from '@/lib/paymongo/signature'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type PayMongoResource = {
  id?: string
  type?: string
  attributes?: {
    metadata?: {
      organization_id?: string
      plan_code?: string
    }
    payments?: Array<{ id?: string }>
    payment_intent?: {
      attributes?: {
        payments?: Array<{ id?: string }>
      }
    }
  }
}

type PayMongoWebhookBody = {
  data?: {
    id?: string
    type?: string
    attributes?: {
      type?: string
      livemode?: boolean
      data?: PayMongoResource
    }
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim()

  if (!webhookSecret) {
    console.error('PAYMONGO WEBHOOK ERROR: missing PAYMONGO_WEBHOOK_SECRET')
    return NextResponse.json(
      { error: 'PayMongo webhook is not configured.' },
      { status: 503 },
    )
  }

  const rawBody = await request.text()
  const verification = verifyPayMongoSignature({
    rawBody,
    signatureHeader: request.headers.get('paymongo-signature'),
    webhookSecret,
    toleranceSeconds: 300,
  })

  if (!verification.valid || !verification.timestamp) {
    console.warn('PAYMONGO WEBHOOK SIGNATURE REJECTED:', verification.reason)
    return NextResponse.json(
      { error: 'Invalid PayMongo webhook signature.' },
      { status: 400 },
    )
  }

  let body: PayMongoWebhookBody
  try {
    body = JSON.parse(rawBody) as PayMongoWebhookBody
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook payload.' },
      { status: 400 },
    )
  }

  const eventId = cleanText(body.data?.id)
  const eventType = cleanText(body.data?.attributes?.type) ?? 'unknown'
  const resource = body.data?.attributes?.data
  const metadata = resource?.attributes?.metadata
  const organizationText = cleanText(metadata?.organization_id)
  const organizationId =
    organizationText && UUID_PATTERN.test(organizationText)
      ? organizationText
      : null
  const checkoutId = cleanText(resource?.id)
  const planCode = cleanText(metadata?.plan_code)
  const paymentId = cleanText(
    resource?.attributes?.payments?.[0]?.id ??
      resource?.attributes?.payment_intent?.attributes?.payments?.[0]?.id,
  )

  if (!eventId) {
    return NextResponse.json(
      { error: 'PayMongo event ID is missing.' },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc(
      'process_paymongo_webhook_event',
      {
        p_event_id: eventId,
        p_event_type: eventType,
        p_livemode: body.data?.attributes?.livemode ?? null,
        p_signature_timestamp: new Date(
          verification.timestamp * 1000,
        ).toISOString(),
        p_resource_type: cleanText(resource?.type),
        p_resource_id: cleanText(resource?.id),
        p_organization_id: organizationId,
        p_checkout_id: checkoutId,
        p_payment_id: paymentId,
        p_plan_code: planCode,
        p_payload: body,
      },
    )

    if (error) {
      throw new Error(error.message)
    }

    const result = data ?? {}
    if (result.status === 'failed') {
      console.error('PAYMONGO WEBHOOK PROCESSING FAILED:', {
        eventId,
        eventType,
        result,
      })
      return NextResponse.json(
        { error: 'Webhook processing failed.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      received: true,
      eventId,
      eventType,
      mode: verification.mode,
      ...result,
    })
  } catch (error) {
    console.error('PAYMONGO WEBHOOK PROCESSING ERROR:', {
      eventId,
      eventType,
      error,
    })

    return NextResponse.json(
      { error: 'Webhook processing failed.' },
      { status: 500 },
    )
  }
}
