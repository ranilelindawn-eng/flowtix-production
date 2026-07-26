import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

export async function POST(request: Request) {
  const { callId } = await request.json() as { callId?: string }
  const organization = await getCurrentOrganization()
  if (!organization || !callId) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 503 })
  const supabase = await createClient()
  const { data: transcript } = await supabase.from('call_transcripts').select('content').eq('call_id', callId).eq('organization_id', organization.organization_id).maybeSingle()
  if (!transcript?.content) return NextResponse.json({ error: 'Transcript not found.' }, { status: 404 })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_CALL_ANALYSIS_MODEL || 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Analyze a sales call. Return JSON with summary, sentiment (positive|neutral|negative), action_items (string array), keywords (string array), and score (0-100).' },
        { role: 'user', content: transcript.content },
      ],
    }),
  })
  if (!response.ok) return NextResponse.json({ error: await response.text() }, { status: 502 })
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const analysis = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}') as Record<string, unknown>
  const { data: claims } = await supabase.auth.getClaims()
  await supabase.from('call_ai_insights').upsert({
    organization_id: organization.organization_id,
    call_id: callId,
    summary: analysis.summary ?? '',
    sentiment: analysis.sentiment ?? 'neutral',
    action_items: analysis.action_items ?? [],
    keywords: analysis.keywords ?? [],
    score: analysis.score ?? null,
    provider: 'openai',
    created_by: claims?.claims?.sub,
  }, { onConflict: 'call_id' })
  return NextResponse.json({ success: true, analysis })
}
