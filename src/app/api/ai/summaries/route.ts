import { NextResponse } from 'next/server'

import { customerAIErrorMessage } from '@/lib/ai/errors'

import { requirePermission } from '@/lib/auth'
import { generateTranscriptSummary } from '@/lib/ai/summaries/service'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { isAIUsageControlError } from '@/lib/ai/usage/service'

export async function POST(request: Request) {
  try {
    const organization = await requirePermission('summaries.create')
    await assertEntitlement('ai.call_analysis', organization.organization_id)

    const body = (await request.json()) as { transcriptId?: unknown; title?: unknown }
    const transcriptId = typeof body.transcriptId === 'string' ? body.transcriptId.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''

    if (!transcriptId) {
      return NextResponse.json({ error: 'A transcript is required.' }, { status: 400 })
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title must be 200 characters or fewer.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
    if (claimsError) throw new Error(claimsError.message)
    const userId = claimsData?.claims?.sub
    if (typeof userId !== 'string' || !userId) throw new Error('Unable to verify the authenticated user.')

    const usageKey = deriveWindowedIdempotencyKey(
        'ai.summary.transcript',
        { organizationId: organization.organization_id, transcriptId },
        300,
      )

    const result = await generateTranscriptSummary(supabase, {
      organizationId: organization.organization_id,
      userId,
      usageIdempotencyKey: usageKey,
      transcriptId,
      requestedTitle: title || null,
    })

    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (error) {
    return NextResponse.json(
      { error: customerAIErrorMessage(error, 'The AI summary could not be generated. Please try again.') },
      { status: isEntitlementError(error) ? 403 : isAIUsageControlError(error) ? 402 : 500 },
    )
  }
}
