import { NextResponse } from 'next/server'

import { processPayMongoWebhookBody, type PayMongoWebhookBody } from '@/lib/billing/paymongo-webhook'
import { replayWebhookEvent } from '@/lib/billing/platform'

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const eventId = form.get('event_id')?.toString().trim()
    if (!eventId) return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 })
    const replay = await replayWebhookEvent(eventId) as { payload?: PayMongoWebhookBody }
    if (!replay.payload) throw new Error('Stored webhook payload is unavailable.')
    const processed = await processPayMongoWebhookBody(replay.payload, new Date().toISOString())
    return NextResponse.json({ replayed: true, processed })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Replay failed.' }, { status: 400 })
  }
}
