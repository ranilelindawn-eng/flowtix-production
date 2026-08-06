import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'

export async function GET(request: Request) {
  const organization = await getCurrentOrganization()
  if (!organization) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (!hasPermission(organization.role, 'recordings.view')) return NextResponse.json({ error: 'You do not have permission to view recordings.' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'Recording ID is required.' }, { status: 400 })

  const supabase = await createClient()
  const { data: recording } = await supabase
    .from('call_recordings')
    .select('provider_url,provider')
    .eq('id', id)
    .eq('organization_id', organization.organization_id)
    .maybeSingle()
  if (!recording?.provider_url) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })
  if ((recording.provider ?? 'twilio') !== 'twilio') return NextResponse.json({ error: 'Media retrieval for this provider is not yet supported.' }, { status: 409 })

  const config = await getOrganizationTwilioConfiguration(organization.organization_id)
  const response = await fetch(`${recording.provider_url}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}` },
    cache: 'no-store',
  })
  if (!response.ok || !response.body) return NextResponse.json({ error: 'Unable to retrieve recording.' }, { status: 502 })

  const download = new URL(request.url).searchParams.get('download') === '1'
  return new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(download ? { 'Content-Disposition': `attachment; filename="flowtix-recording-${id}.mp3"` } : {}),
    },
  })
}
