import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

const statusMap: Record<string, string> = {
  queued: 'queued', initiated: 'ringing', ringing: 'ringing',
  'in-progress': 'connected', completed: 'completed', busy: 'failed',
  failed: 'failed', 'no-answer': 'failed', canceled: 'cancelled',
}

export async function POST(request: Request) {
  const form = await parseTwilioForm(request)
  const url = new URL(request.url)
  const callId = url.searchParams.get('callId')
  const organizationId = url.searchParams.get('organizationId')
  if (!organizationId) return new Response('Forbidden', { status: 403 })

  const config = await getOrganizationTwilioConfiguration(organizationId)
  if (!validateTwilioWebhook(request, form, config.authToken)) return new Response('Forbidden', { status: 403 })
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
  await createTelephonyAdminClient().from('calls').update(update).eq('id', callId).eq('organization_id', organizationId)
  return new Response('OK')
}
