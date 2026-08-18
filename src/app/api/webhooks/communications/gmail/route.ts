import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { enqueueGmailSync, resolveGmailOrganization } from '@/lib/communications/gmail-inbox'

export const dynamic = 'force-dynamic'

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue)
  const right = Buffer.from(rightValue)
  return left.length === right.length && timingSafeEqual(left, right)
}

type PubSubPush = {
  message?: {
    data?: string
    messageId?: string
    publishTime?: string
  }
  subscription?: string
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.GMAIL_PUBSUB_WEBHOOK_SECRET?.trim()
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'Gmail Pub/Sub webhook is not configured.' },
        { status: 503 },
      )
    }

    const url = new URL(request.url)
    const suppliedSecret = url.searchParams.get('token')?.trim() ?? ''
    if (!suppliedSecret || !safeEqual(suppliedSecret, expectedSecret)) {
      return NextResponse.json({ error: 'Unauthorized Gmail push.' }, { status: 401 })
    }

    const push = await request.json() as PubSubPush
    const encoded = push.message?.data?.trim()
    if (!encoded) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    let payload: { emailAddress?: string; historyId?: string }
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        emailAddress?: string
        historyId?: string
      }
    } catch {
      return NextResponse.json({ error: 'Invalid Gmail push payload.' }, { status: 400 })
    }

    const emailAddress = payload.emailAddress?.trim().toLowerCase() ?? ''
    const historyId = payload.historyId?.trim() ?? ''
    if (!emailAddress || !historyId) {
      return NextResponse.json({ error: 'Incomplete Gmail push payload.' }, { status: 400 })
    }

    const organizationId = await resolveGmailOrganization(emailAddress)
    if (!organizationId) {
      console.warn('Gmail push ignored because no unique Flowtix organization owns the mailbox.', {
        emailAddress,
        pubSubMessageId: push.message?.messageId ?? null,
      })
      return NextResponse.json({ ok: true, ignored: true })
    }

    await enqueueGmailSync({ organizationId, historyId })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Gmail Pub/Sub webhook failed:', error)
    return NextResponse.json({ error: 'Unable to process Gmail push.' }, { status: 500 })
  }
}
