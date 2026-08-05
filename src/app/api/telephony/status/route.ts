import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { setAgentCallActivity } from '@/lib/telephony/presence/service'
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
  const routingAttemptId = url.searchParams.get('routingAttemptId')
  const organizationId = url.searchParams.get('organizationId')
  const userId = url.searchParams.get('userId')
  if (!organizationId) return new Response('Forbidden', { status: 403 })

  const config = await getOrganizationTwilioConfiguration(organizationId)
  if (!validateTwilioWebhook(request, form, config.authToken)) return new Response('Forbidden', { status: 403 })
  if (!callId) return new Response('OK')

  const providerStatus = form.get('CallStatus') ?? ''
  const providerChildCallId = form.get('CallSid')
  const duration = Number(form.get('CallDuration') ?? 0)
  const status = statusMap[providerStatus] ?? 'ringing'
  const admin = createTelephonyAdminClient()

  if (status === 'connected' && routingAttemptId && userId) {
    const { data: claimed, error: claimError } = await admin.rpc('claim_inbound_call_answer', {
      target_organization: organizationId,
      target_attempt: routingAttemptId,
      target_user: userId,
      child_provider_call_id: providerChildCallId,
    })
    if (claimError) console.error('Inbound answer ownership claim failed:', claimError)
    if (claimed === false) {
      return new Response('OK')
    }
  }

  if (userId && status === 'connected') {
    await setAgentCallActivity({ organizationId, userId, state: 'busy', callId }).catch((error) => {
      console.error('Unable to mark answering agent busy:', error)
    })
  }

  const update: Record<string, unknown> = {
    status,
    provider_child_call_sid: providerChildCallId,
    updated_at: new Date().toISOString(),
  }
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    update.ended_at = new Date().toISOString()
    update.duration_seconds = Number.isFinite(duration) ? duration : 0
  }
  await admin.from('calls').update(update).eq('id', callId).eq('organization_id', organizationId)

  if (userId && (status === 'completed' || status === 'failed' || status === 'cancelled')) {
    await setAgentCallActivity({ organizationId, userId, state: 'wrap_up', callId, wrapUpSeconds: 30 }).catch((error) => {
      console.error('Unable to start agent wrap-up:', error)
    })
  }

  if (routingAttemptId) {
    const terminal = status === 'completed' || status === 'failed' || status === 'cancelled'
    const attemptStatus = status === 'connected' ? 'answered' : terminal ? status : 'ringing'
    const attemptUpdate: Record<string, unknown> = { status: attemptStatus, updated_at: new Date().toISOString() }
    if (terminal) attemptUpdate.completed_at = new Date().toISOString()
    await Promise.all([
      admin.from('call_routing_attempts').update(attemptUpdate).eq('id', routingAttemptId).eq('organization_id', organizationId),
      admin.from('call_routing_history').insert({
        organization_id: organizationId,
        call_id: callId,
        routing_attempt_id: routingAttemptId,
        event_type: `provider_${providerStatus || 'unknown'}`,
        to_status: attemptStatus,
        user_id: userId,
        provider_call_id: providerChildCallId,
        metadata: { durationSeconds: Number.isFinite(duration) ? duration : 0 },
      }),
    ])
  }

  return new Response('OK')
}
