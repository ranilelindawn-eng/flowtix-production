import { NextResponse } from 'next/server'

import { requireOrganization } from '@/lib/auth'
import { assertEntitlement, isEntitlementError } from '@/lib/entitlements'
import { getAIProviderLabel, type AIAnalysis } from '@/lib/ai/provider'
import { generatePromptStructured } from '@/lib/ai/prompts'
import { validateAIAnalysis } from '@/lib/ai/validation'
import { deriveWindowedIdempotencyKey } from '@/lib/idempotency'
import { createClient } from '@/lib/supabase/server'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

const MIN_TRANSCRIPT_LENGTH = 20
const MAX_TRANSCRIPT_LENGTH = 50_000

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    await assertEntitlement('ai.call_analysis', organization.organization_id)
    const body = (await request.json()) as {
      transcript?: unknown
      callId?: unknown
      contactId?: unknown
    }

    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
    const callId = typeof body.callId === 'string' && body.callId.trim() ? body.callId.trim() : null
    const contactId =
      typeof body.contactId === 'string' && body.contactId.trim() ? body.contactId.trim() : null

    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      return NextResponse.json(
        { error: `A transcript of at least ${MIN_TRANSCRIPT_LENGTH} characters is required.` },
        { status: 400 },
      )
    }

    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return NextResponse.json(
        { error: `Transcript must be ${MAX_TRANSCRIPT_LENGTH.toLocaleString()} characters or fewer.` },
        { status: 400 },
      )
    }

    await consumeMeteredUsage(
      'ai_requests',
      1,
      organization.organization_id,
      deriveWindowedIdempotencyKey('ai.call_analysis', { transcript, callId, contactId }, 300),
    )

    const generated = await generatePromptStructured<AIAnalysis>({
      promptKey: 'call.analysis',
      variables: { transcript },
    })
    const result = validateAIAnalysis(generated.value)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ai_call_analyses')
      .insert({
        organization_id: organization.organization_id,
        call_id: callId,
        contact_id: contactId,
        transcript_text: transcript,
        summary: result.summary,
        follow_up: result.followUp,
        sentiment: result.sentiment,
        sentiment_score: result.sentimentScore,
        call_score: result.callScore,
        objections: result.objections,
        action_items: result.actionItems,
        keywords: result.keywords,
        coaching: result.coaching,
        next_best_action: result.nextBestAction,
        provider: getAIProviderLabel(),
      })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ analysis: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI analysis failed.' },
      { status: isEntitlementError(error) ? 403 : isUsageLimitError(error) ? 402 : 500 },
    )
  }
}
