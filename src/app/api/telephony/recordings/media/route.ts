import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'

export async function GET(request: Request) {
  const organization = await getCurrentOrganization()
  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!organization || !id) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const supabase = await createClient()
  const { data: recording } = await supabase
    .from('call_recordings')
    .select('provider_url')
    .eq('id', id)
    .eq('organization_id', organization.organization_id)
    .maybeSingle()
  if (!recording?.provider_url) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })

  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const mediaUrl = `${recording.provider_url}.mp3`
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
    },
  })
  if (!response.ok || !response.body) return NextResponse.json({ error: 'Unable to retrieve recording.' }, { status: 502 })

  const download = new URL(request.url).searchParams.get('download') === '1'
  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'private, max-age=300',
      ...(download ? { 'Content-Disposition': `attachment; filename="flowtix-recording-${id}.mp3"` } : {}),
    },
  })
}
