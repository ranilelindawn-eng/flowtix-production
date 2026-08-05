import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { analyzeSentiment } from '@/lib/ai/sentiment/service'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.call_analysis', organization.organization_id)

    const body = (await request.json()) as {
      text?: unknown
      transcriptId?: unknown
      callId?: unknown
      contactId?: unknown
    }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const transcriptId = typeof body.transcriptId === 'string' ? body.transcriptId.trim() : ''
    const callId = typeof body.callId === 'string' && body.callId.trim() ? body.callId.trim() : null
    const contactId =
      typeof body.contactId === 'string' && body.contactId.trim() ? body.contactId.trim() : null

    if (!text && !transcriptId) {
      return NextResponse.json({ error: 'Text or a transcript is required.' }, { status: 400 })
    }
    if (text && transcriptId) {
      return NextResponse.json({ error: 'Provide text or a transcript, not both.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
    if (claimsError) throw new Error(claimsError.message)
    const userId = claimsData?.claims?.sub
    if (typeof userId !== 'string' || !userId) throw new Error('Unable to verify the authenticated user.')

    await consumeMeteredUsage(
      'ai_requests',
      1,
      organization.organization_id,
      deriveWindowedIdempotencyKey(
        'ai.sentiment',
        { organizationId: organization.organization_id, text, transcriptId, callId, contactId },
        300,
      ),
    )

    const result = await analyzeSentiment(supabase, {
      organizationId: organization.organization_id,
      userId,
      text: text || null,
      transcriptId: transcriptId || null,
      callId,
      contactId,
    })

    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI sentiment analysis failed.' },
      { status: isEntitlementError(error) ? 403 : isUsageLimitError(error) ? 402 : 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const organization = await requireOrganization()
    const url = new URL(request.url)
    const transcriptId = url.searchParams.get('transcriptId')?.trim()
    const callId = url.searchParams.get('callId')?.trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25))

    const supabase = await createClient()
    let query = supabase
      .from('ai_sentiment_analyses')
      .select('*')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (transcriptId) query = query.eq('transcript_id', transcriptId)
    if (callId) query = query.eq('call_id', callId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ analyses: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load sentiment analyses.' },
      { status: 500 },
    )
  }
}
