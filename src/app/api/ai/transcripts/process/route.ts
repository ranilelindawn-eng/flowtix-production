import { NextResponse } from 'next/server'

import { customerAIErrorMessage } from '@/lib/ai/errors'

import { processTranscript } from '@/lib/ai/transcripts/service'
import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { isAIUsageControlError } from '@/lib/ai/usage/service'

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.transcription', organization.organization_id)

    const body = (await request.json()) as { transcriptId?: unknown }
    const transcriptId = typeof body.transcriptId === 'string' ? body.transcriptId.trim() : ''
    if (!transcriptId) return NextResponse.json({ error: 'A transcript is required.' }, { status: 400 })

    const supabase = await createClient()
    const { data: claims, error: claimsError } = await supabase.auth.getClaims()
    if (claimsError) throw new Error(claimsError.message)
    const userId = claims?.claims?.sub
    if (typeof userId !== 'string' || !userId) throw new Error('Unable to verify the authenticated user.')

    const usageKey = deriveWindowedIdempotencyKey('ai.transcript.process', { organizationId: organization.organization_id, transcriptId }, 300)

    const result = await processTranscript(supabase, {
      organizationId: organization.organization_id,
      userId,
      usageIdempotencyKey: usageKey,
      transcriptId,
    })

    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: customerAIErrorMessage(error, 'AI transcript processing could not be completed. Please try again.') },
      { status: isEntitlementError(error) ? 403 : isAIUsageControlError(error) ? 402 : 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const organization = await requireOrganization()
    const url = new URL(request.url)
    const transcriptId = url.searchParams.get('transcriptId')?.trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25))

    const supabase = await createClient()
    let query = supabase
      .from('ai_transcript_processing_runs')
      .select('*')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (transcriptId) query = query.eq('transcript_id', transcriptId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ runs: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load transcript processing history.' },
      { status: 500 },
    )
  }
}
