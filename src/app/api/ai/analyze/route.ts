import { NextResponse } from 'next/server'
import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { generateStructuredAI, type AIAnalysis } from '@/lib/ai/provider'

export async function POST(request: Request) {
  try {
    const organization = await requireOrganization()
    const body = (await request.json()) as { transcript?: string; callId?: string; contactId?: string }
    const transcript = body.transcript?.trim()
    if (!transcript || transcript.length < 20) return NextResponse.json({ error: 'A transcript of at least 20 characters is required.' }, { status: 400 })
    if (transcript.length > 50000) return NextResponse.json({ error: 'Transcript is too long.' }, { status: 400 })

    const result = await generateStructuredAI<AIAnalysis>({
      system: 'You are a senior sales-call analyst. Be factual, practical, concise, and never invent details absent from the transcript.',
      prompt: `Analyze this sales or support call transcript:\n\n${transcript}`,
      schemaDescription: {
        summary: 'string', followUp: 'string', sentiment: 'positive|neutral|negative|mixed', sentimentScore: 'number from -1 to 1', callScore: 'integer 0 to 100',
        objections: [{ objection: 'string', response: 'recommended response' }], actionItems: ['string'], keywords: ['string'], coaching: ['string'], nextBestAction: 'string',
      },
    })

    const supabase = await createClient()
    const { data, error } = await supabase.from('ai_call_analyses').insert({
      organization_id: organization.organization_id,
      call_id: body.callId || null,
      contact_id: body.contactId || null,
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
      provider: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    }).select('*').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ analysis: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI analysis failed.' }, { status: 500 })
  }
}
