import { NextResponse } from 'next/server'

import { customerAIErrorMessage } from '@/lib/ai/errors'
import { transcribeAI } from '@/lib/ai/service'
import {
  completeAIUsage,
  failAIUsage,
  isAIUsageControlError,
  reserveAIUsage,
} from '@/lib/ai/usage/service'
import {
  assertEntitlement,
  isEntitlementError,
} from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/server'
import { fetchProviderRecordingMedia } from '@/lib/telephony/recording-media'
import { getCurrentOrganization } from '@/lib/team'

export async function POST(request: Request) {
  try {
    const { recordingId } = (await request.json()) as {
      recordingId?: string
    }
    const organization = await getCurrentOrganization()

    if (!organization || !recordingId) {
      return NextResponse.json(
        { error: 'Invalid request.' },
        { status: 400 },
      )
    }

    await assertEntitlement(
      'ai.transcription',
      organization.organization_id,
    )

    const supabase = await createClient()
    const { data: recording, error: recordingError } = await supabase
      .from('call_recordings')
      .select('id,call_id,provider,provider_recording_sid,provider_url')
      .eq('id', recordingId)
      .eq('organization_id', organization.organization_id)
      .maybeSingle()

    if (recordingError) {
      return NextResponse.json(
        { error: `Unable to load recording: ${recordingError.message}` },
        { status: 500 },
      )
    }

    if (
      !recording ||
      !recording.provider_recording_sid ||
      !recording.provider_url
    ) {
      return NextResponse.json(
        { error: 'Recording not found.' },
        { status: 404 },
      )
    }

    const media = await fetchProviderRecordingMedia({
      organizationId: organization.organization_id,
      recording: {
        provider: recording.provider,
        providerRecordingId: recording.provider_recording_sid,
        providerUrl: recording.provider_url,
      },
    })

    const audioBuffer = await media.response.arrayBuffer()
    const audio = new File(
      [audioBuffer],
      `call.${media.extension}`,
      { type: media.contentType },
    )

    const reservation = await reserveAIUsage(supabase, {
      organizationId: organization.organization_id,
      feature: 'transcription',
      idempotencyKey: `transcription:${recordingId}`,
    })

    let result: Awaited<ReturnType<typeof transcribeAI>>
    try {
      result = await transcribeAI({ file: audio })
      await completeAIUsage(supabase, reservation.id, {
        provider: result.provider,
        model: result.model,
        requestId: result.requestId,
        latencyMs: result.latencyMs,
        costMicros: null,
        metadata: {
          recordingId,
          callId: recording.call_id,
          recordingProvider: recording.provider,
          costCalculated: false,
        },
      })
    } catch (transcriptionError) {
      await failAIUsage(supabase, reservation.id, transcriptionError)
      throw transcriptionError
    }

    const { data: claims } = await supabase.auth.getClaims()

    await supabase.from('call_transcripts').upsert(
      {
        organization_id: organization.organization_id,
        call_id: recording.call_id,
        recording_id: recording.id,
        provider: result.provider,
        language: result.language ?? 'en',
        content: result.text,
        status: 'completed',
        created_by: claims?.claims?.sub,
      },
      { onConflict: 'call_id' },
    )

    return NextResponse.json({
      success: true,
      transcript: result.text,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: customerAIErrorMessage(
          error,
          'AI transcription could not be completed. Please try again.',
        ),
      },
      {
        status: isEntitlementError(error)
          ? 403
          : isAIUsageControlError(error)
            ? 402
            : 500,
      },
    )
  }
}
