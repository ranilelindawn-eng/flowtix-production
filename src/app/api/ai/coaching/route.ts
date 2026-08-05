import { NextResponse } from 'next/server'

import { generateCallCoaching } from '@/lib/ai/coaching/service'
import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.call_analysis', organization.organization_id)

    const body = (await request.json()) as {
      transcriptId?: unknown
      focus?: unknown
      agentUserId?: unknown
    }
    const transcriptId = typeof body.transcriptId === 'string' ? body.transcriptId.trim() : ''
    const focus = typeof body.focus === 'string' ? body.focus.trim() : ''
    const agentUserId =
      typeof body.agentUserId === 'string' && body.agentUserId.trim() ? body.agentUserId.trim() : null

    if (!transcriptId) {
      return NextResponse.json({ error: 'A transcript is required.' }, { status: 400 })
    }
    if (focus.length > 500) {
      return NextResponse.json({ error: 'Coaching focus must be 500 characters or fewer.' }, { status: 400 })
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
        'ai.coaching.call',
        { organizationId: organization.organization_id, transcriptId, focus, agentUserId },
        300,
      ),
    )

    const result = await generateCallCoaching(supabase, {
      organizationId: organization.organization_id,
      userId,
      transcriptId,
      focus: focus || null,
      agentUserId,
    })
    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI coaching generation failed.' },
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
    const agentUserId = url.searchParams.get('agentUserId')?.trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25))

    const supabase = await createClient()
    let query = supabase
      .from('ai_coaching_analyses')
      .select('*')
      .eq('organization_id', organization.organization_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (transcriptId) query = query.eq('transcript_id', transcriptId)
    if (callId) query = query.eq('call_id', callId)
    if (agentUserId) query = query.eq('agent_user_id', agentUserId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ coaching: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load AI coaching analyses.' },
      { status: 500 },
    )
  }
}
