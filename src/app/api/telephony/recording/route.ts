import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

function finiteNonNegative(value: string | null, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export async function POST(request: Request) {
  try {
    const form = await parseTwilioForm(request)
    const organizationId = new URL(request.url).searchParams.get('organizationId')
    if (!organizationId) return new Response('Forbidden', { status: 403 })

    const config = await getOrganizationTwilioConfiguration(organizationId)
    if (!validateTwilioWebhook(request, form, config.authToken)) {
      return new Response('Forbidden', { status: 403 })
    }

    const callSid = form.get('CallSid')
    const recordingSid = form.get('RecordingSid')
    const recordingUrl = form.get('RecordingUrl')
    const recordingStatus = (form.get('RecordingStatus') ?? 'completed').toLowerCase()
    if (!callSid || !recordingSid) return new Response('OK')

    const admin = createTelephonyAdminClient()
    const { data: call, error: callError } = await admin
      .from('calls')
      .select('id, organization_id, created_by')
      .eq('organization_id', organizationId)
      .or(`provider_call_sid.eq.${callSid},provider_child_call_sid.eq.${callSid}`)
      .maybeSingle()
    if (callError) {
      console.error('Unable to resolve recording call:', callError)
      return new Response('Temporary failure', { status: 500 })
    }
    if (!call) return new Response('OK')

    const successful = recordingStatus === 'completed' && Boolean(recordingUrl)
    const { error: recordingError } = await admin.from('call_recordings').upsert(
      {
        organization_id: call.organization_id,
        call_id: call.id,
        provider: 'twilio',
        provider_recording_sid: recordingSid,
        provider_url: recordingUrl,
        status: recordingStatus,
        duration_seconds: finiteNonNegative(form.get('RecordingDuration')),
        channels: Math.max(1, Math.min(2, finiteNonNegative(form.get('RecordingChannels'), 1))),
        created_by: call.created_by,
      },
      { onConflict: 'provider_recording_sid' },
    )
    if (recordingError) {
      console.error('Unable to persist recording callback:', recordingError)
      return new Response('Temporary failure', { status: 500 })
    }

    if (successful) {
      const { error: updateError } = await admin
        .from('calls')
        .update({ recording_available: true, updated_at: new Date().toISOString() })
        .eq('id', call.id)
        .eq('organization_id', organizationId)
      if (updateError) {
        console.error('Unable to mark recording available:', updateError)
        return new Response('Temporary failure', { status: 500 })
      }
    }

    return new Response('OK')
  } catch (error) {
    console.error('Recording callback failed:', error)
    return new Response('Temporary failure', { status: 500 })
  }
}
