import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  if (!validateTwilioWebhook(request, form)) return new Response('Forbidden', { status: 403 })
  const callSid = form.get('CallSid')
  const recordingSid = form.get('RecordingSid')
  const recordingUrl = form.get('RecordingUrl')
  if (!callSid || !recordingSid || !recordingUrl) return new Response('OK')

  const admin = createTelephonyAdminClient()
  const { data: call } = await admin
    .from('calls')
    .select('id, organization_id, created_by')
    .or(`provider_call_sid.eq.${callSid},provider_child_call_sid.eq.${callSid}`)
    .maybeSingle()
  if (!call) return new Response('OK')

  await admin.from('call_recordings').upsert({
    organization_id: call.organization_id,
    call_id: call.id,
    provider: 'twilio',
    provider_recording_sid: recordingSid,
    provider_url: recordingUrl,
    status: form.get('RecordingStatus') ?? 'completed',
    duration_seconds: Number(form.get('RecordingDuration') ?? 0),
    channels: Number(form.get('RecordingChannels') ?? 2),
    created_by: call.created_by,
  }, { onConflict: 'provider_recording_sid' })

  await admin.from('calls').update({ recording_available: true }).eq('id', call.id)
  return new Response('OK')
}
