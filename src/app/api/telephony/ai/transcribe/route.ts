import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'

export async function POST(request: Request) {
  const { recordingId } = await request.json() as { recordingId?: string }
  const organization = await getCurrentOrganization()
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!organization || !recordingId) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 503 })

  const supabase = await createClient()
  const { data: recording } = await supabase
    .from('call_recordings')
    .select('id, call_id, provider_url')
    .eq('id', recordingId)
    .eq('organization_id', organization.organization_id)
    .maybeSingle()
  if (!recording) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })

  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const audioResponse = await fetch(`${recording.provider_url}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}` },
  })
  if (!audioResponse.ok) return NextResponse.json({ error: 'Unable to download the recording.' }, { status: 502 })

  const audio = await audioResponse.blob()
  const form = new FormData()
  form.set('file', new File([audio], 'call.mp3', { type: 'audio/mpeg' }))
  form.set('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe')
  form.set('response_format', 'json')

  const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!transcriptionResponse.ok) return NextResponse.json({ error: await transcriptionResponse.text() }, { status: 502 })
  const result = await transcriptionResponse.json() as { text?: string; language?: string }
  const { data: claims } = await supabase.auth.getClaims()
  await supabase.from('call_transcripts').upsert({
    organization_id: organization.organization_id,
    call_id: recording.call_id,
    recording_id: recording.id,
    provider: 'openai',
    language: result.language ?? 'en',
    content: result.text ?? '',
    status: 'completed',
    created_by: claims?.claims?.sub,
  }, { onConflict: 'call_id' })

  return NextResponse.json({ success: true, transcript: result.text ?? '' })
}
