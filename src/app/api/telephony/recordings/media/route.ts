import { NextResponse } from 'next/server'

import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'
import { fetchProviderRecordingMedia } from '@/lib/telephony/recording-media'

function safeDispositionFilename(id: string, extension: string): string {
  const safeExtension = /^[a-z0-9]{1,8}$/i.test(extension) ? extension : 'audio'
  return `flowtix-recording-${id}.${safeExtension}`
}

export async function GET(request: Request) {
  try {
    const organization = await getCurrentOrganization()
    if (!organization) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    if (!hasPermission(organization.role, 'recordings.view')) {
      return NextResponse.json(
        { error: 'You do not have permission to view recordings.' },
        { status: 403 },
      )
    }

    const id = new URL(request.url).searchParams.get('id')?.trim()
    if (!id) {
      return NextResponse.json({ error: 'Recording ID is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: recording, error } = await supabase
      .from('call_recordings')
      .select('provider_url,provider,provider_recording_sid')
      .eq('id', id)
      .eq('organization_id', organization.organization_id)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: `Unable to load recording: ${error.message}` },
        { status: 500 },
      )
    }

    if (
      !recording?.provider_url ||
      !recording.provider_recording_sid
    ) {
      return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })
    }

    const media = await fetchProviderRecordingMedia({
      organizationId: organization.organization_id,
      recording: {
        provider: recording.provider,
        providerRecordingId: recording.provider_recording_sid,
        providerUrl: recording.provider_url,
      },
    })

    const download = new URL(request.url).searchParams.get('download') === '1'

    return new Response(media.response.body, {
      headers: {
        'Content-Type': media.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...(download
          ? {
              'Content-Disposition': `attachment; filename="${safeDispositionFilename(
                id,
                media.extension,
              )}"`,
            }
          : {}),
      },
    })
  } catch (error) {
    console.error('Unable to retrieve provider recording media:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to retrieve recording.',
      },
      { status: 502 },
    )
  }
}
