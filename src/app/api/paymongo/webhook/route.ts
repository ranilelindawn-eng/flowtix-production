import { NextResponse } from 'next/server'

import {
  processPayMongoWebhookBody,
  type PayMongoWebhookBody,
} from '@/lib/billing/paymongo-webhook'
import { expectedPayMongoMode } from '@/lib/billing/config'
import { verifyPayMongoSignature } from '@/lib/paymongo/signature'

export const runtime = 'nodejs'

const MAX_WEBHOOK_BYTES = 1_000_000

export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    console.error('PAYMONGO WEBHOOK ERROR: missing PAYMONGO_WEBHOOK_SECRET')
    return NextResponse.json(
      { error: 'PayMongo webhook is not configured.' },
      { status: 503 },
    )
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'PayMongo webhook requires application/json.' },
      { status: 415 },
    )
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 })
  }

  const verification = verifyPayMongoSignature({
    rawBody,
    signatureHeader: request.headers.get('paymongo-signature'),
    webhookSecret,
    toleranceSeconds: 300,
  })
  if (!verification.valid || verification.timestamp === null || !verification.mode) {
    return NextResponse.json(
      { error: 'Invalid PayMongo webhook signature.' },
      { status: 400 },
    )
  }

  const expectedMode = expectedPayMongoMode()
  if (expectedMode && verification.mode !== expectedMode) {
    console.error('PAYMONGO WEBHOOK ERROR: signature mode does not match secret key mode')
    return NextResponse.json(
      { error: 'PayMongo webhook mode mismatch.' },
      { status: 400 },
    )
  }

  let body: PayMongoWebhookBody
  try {
    body = JSON.parse(rawBody) as PayMongoWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  const eventMode = body.data?.attributes?.livemode === true ? 'live' : 'test'
  if (eventMode !== verification.mode) {
    return NextResponse.json(
      { error: 'PayMongo webhook event mode mismatch.' },
      { status: 400 },
    )
  }

  try {
    const processed = await processPayMongoWebhookBody(
      body,
      new Date(verification.timestamp * 1000).toISOString(),
    )
    return NextResponse.json(
      { received: true, mode: verification.mode, ...processed },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('PAYMONGO WEBHOOK PROCESSING ERROR:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
