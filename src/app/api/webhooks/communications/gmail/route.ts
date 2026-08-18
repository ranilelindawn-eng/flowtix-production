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

type GmailPushPayload = {
  emailAddress?: unknown
  historyId?: unknown
}

function normalizedEmailAddress(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizedHistoryId(value: unknown, rawPayload: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  // Gmail documents historyId as a string, but some delivered notification
  // payloads may expose it as a JSON number. Read the original JSON text first
  // so a uint64 history ID is not rounded by JavaScript number parsing.
  const exactMatch = rawPayload.match(/"historyId"\s*:\s*(?:"([0-9]+)"|([0-9]+))/)
  const exactValue = exactMatch?.[1] ?? exactMatch?.[2] ?? ''
  if (exactValue) return exactValue

  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }

  return ''
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

    let payload: GmailPushPayload
    let rawPayload = ''
    try {
      rawPayload = Buffer.from(encoded, 'base64url').toString('utf8')
      payload = JSON.parse(rawPayload) as GmailPushPayload
    } catch {
      return NextResponse.json({ error: 'Invalid Gmail push payload.' }, { status: 400 })
    }

    const emailAddress = normalizedEmailAddress(payload.emailAddress)
    const historyId = normalizedHistoryId(payload.historyId, rawPayload)
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