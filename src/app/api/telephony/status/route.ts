import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

const statusMap: Record<string, string> = {
  queued: 'queued', initiated: 'ringing', ringing: 'ringing',
  'in-progress': 'connected', completed: 'completed', busy: 'failed',
  failed: 'failed', 'no-answer': 'failed', canceled: 'cancelled',
}

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  if (!validateTwilioWebhook(request, form)) return new Response('Forbidden', { status: 403 })
  const callId = new URL(request.url).searchParams.get('callId')
  if (!callId) return new Response('OK')
  const providerStatus = form.get('CallStatus') ?? ''
  const duration = Number(form.get('CallDuration') ?? 0)
  const status = statusMap[providerStatus] ?? 'ringing'
  const update: Record<string, unknown> = {
    status,
    provider_child_call_sid: form.get('CallSid'),
    updated_at: new Date().toISOString(),
  }
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    update.ended_at = new Date().toISOString()
    update.duration_seconds = Number.isFinite(duration) ? duration : 0
  }
  await createTelephonyAdminClient().from('calls').update(update).eq('id', callId)
  return new Response('OK')
}
