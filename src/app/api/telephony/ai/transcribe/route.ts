import { NextResponse } from 'next/server'

import { transcribeAI } from '@/lib/ai/service'

import {
  assertEntitlement,
  isEntitlementError,
} from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { getCurrentOrganization } from '@/lib/team'
import { consumeMeteredUsage, isUsageLimitError } from '@/lib/usage-limits'

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
    const { data: recording } = await supabase
      .from('call_recordings')
      .select('id, call_id, provider_url')
      .eq('id', recordingId)
      .eq(
        'organization_id',
        organization.organization_id,
      )
      .maybeSingle()

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found.' },
        { status: 404 },
      )
    }

    await consumeMeteredUsage(
      'ai_requests',
      1,
      organization.organization_id,
      `transcription:${recordingId}`,
    )

    const config =
      await getOrganizationTwilioConfiguration(
        organization.organization_id,
      )
    const audioResponse = await fetch(
      `${recording.provider_url}.mp3`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${config.accountSid}:${config.authToken}`,
          ).toString('base64')}`,
        },
      },
    )

    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: 'Unable to download the recording.' },
        { status: 502 },
      )
    }

    const audio = await audioResponse.blob()
    const result = await transcribeAI({
      file: new File([audio], 'call.mp3', { type: 'audio/mpeg' }),
    })
    const { data: claims } =
      await supabase.auth.getClaims()

    await supabase.from('call_transcripts').upsert(
      {
        organization_id:
          organization.organization_id,
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
        error:
          error instanceof Error
            ? error.message
            : 'Transcription failed.',
      },
      {
        status: isEntitlementError(error) ? 403 : isUsageLimitError(error) ? 402 : 500,
      },
    )
  }
}
