import { NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth'
import { getRecording, getRecordingSignedUrl } from '@/lib/recordings'

function filename(storagePath: string): string {
  return storagePath.split('/').pop() || 'flowtix-recording'
}

export async function GET(request: Request) {
  try {
    await requirePermission('recordings.view')

    const id = new URL(request.url).searchParams.get('id')?.trim()
    if (!id) {
      return NextResponse.json({ error: 'Recording ID is required.' }, { status: 400 })
    }

    const recording = await getRecording(id)
    if (!recording) {
      return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })
    }

    const signedUrl = await getRecordingSignedUrl(recording, 300)
    if (!signedUrl) {
      return NextResponse.json(
        { error: 'Unable to create a secure recording download.' },
        { status: 502 },
      )
    }

    const media = await fetch(signedUrl, {
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!media.ok || !media.body) {
      return NextResponse.json(
        { error: `Unable to retrieve recording media (HTTP ${media.status}).` },
        { status: 502 },
      )
    }

    const download = new URL(request.url).searchParams.get('download') === '1'
    const contentType = media.headers.get('content-type') || recording.mime_type || 'application/octet-stream'

    return new Response(media.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(download
          ? {
              'Content-Disposition': `attachment; filename="${filename(recording.storage_path).replace(/["\\]/g, '_')}"`,
            }
          : {}),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to retrieve recording.',
      },
      { status: 500 },
    )
  }
}
