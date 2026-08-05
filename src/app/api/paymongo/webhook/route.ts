import { NextResponse } from 'next/server'

import { processPayMongoWebhookBody, type PayMongoWebhookBody } from '@/lib/billing/paymongo-webhook'
import { verifyPayMongoSignature } from '@/lib/paymongo/signature'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    console.error('PAYMONGO WEBHOOK ERROR: missing PAYMONGO_WEBHOOK_SECRET')
    return NextResponse.json({ error: 'PayMongo webhook is not configured.' }, { status: 503 })
  }
  const rawBody = await request.text()
  const verification = verifyPayMongoSignature({
    rawBody,
    signatureHeader: request.headers.get('paymongo-signature'),
    webhookSecret,
    toleranceSeconds: 300,
  })
  if (!verification.valid || verification.timestamp === null) {
    return NextResponse.json({ error: 'Invalid PayMongo webhook signature.' }, { status: 400 })
  }
  let body: PayMongoWebhookBody
  try {
    body = JSON.parse(rawBody) as PayMongoWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }
  try {
    const processed = await processPayMongoWebhookBody(body, new Date(verification.timestamp * 1000).toISOString())
    return NextResponse.json({ received: true, mode: verification.mode, ...processed })
  } catch (error) {
    console.error('PAYMONGO WEBHOOK PROCESSING ERROR:', error)
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}
