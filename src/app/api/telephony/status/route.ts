import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { setAgentCallActivity } from '@/lib/telephony/presence/service'
import { completeQueueReservation, releaseQueueReservation } from '@/lib/telephony/queues/service'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

const statusMap: Record<string, string> = {
  queued: 'queued',
  initiated: 'ringing',
  ringing: 'ringing',
  'in-progress': 'connected',
  completed: 'completed',
  busy: 'failed',
  failed: 'failed',
  'no-answer': 'failed',
  canceled: 'cancelled',
}

const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

export async function POST(request: Request) {
  try {
    const form = await parseTwilioForm(request)
    const url = new URL(request.url)
    const callId = url.searchParams.get('callId')
    const routingAttemptId = url.searchParams.get('routingAttemptId')
    const organizationId = url.searchParams.get('organizationId')
    const userId = url.searchParams.get('userId')
    const sourceRingGroupId = url.searchParams.get('sourceRingGroupId')
    const queueReservationId = url.searchParams.get('queueReservationId')
    if (!organizationId) return new Response('Forbidden', { status: 403 })

    const config = await getOrganizationTwilioConfiguration(organizationId)
    if (!validateTwilioWebhook(request, form, config.authToken)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!callId) return new Response('OK')

    const providerStatus = (form.get('CallStatus') ?? '').toLowerCase()
    const providerChildCallId = form.get('CallSid')
    const durationValue = Number(form.get('CallDuration') ?? 0)
    const duration = Number.isFinite(durationValue) && durationValue >= 0 ? durationValue : 0
    const status = statusMap[providerStatus] ?? 'ringing'
    const admin = createTelephonyAdminClient()

    const { data: call, error: callError } = await admin
      .from('calls')
      .select('id, status, assigned_to, provider_child_call_sid')
      .eq('id', callId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (callError) {
      console.error('Unable to resolve status callback call:', callError)
      return new Response('Temporary failure', { status: 500 })
    }
    if (!call) return new Response('OK')

    if (
      call.provider_child_call_sid &&
      providerChildCallId &&
      call.provider_child_call_sid !== providerChildCallId
    ) {
      return new Response('OK')
    }

    // Provider callbacks can arrive out of order. Never regress a terminal call.
    if (terminalStatuses.has(call.status) && !terminalStatuses.has(status)) {
      return new Response('OK')
    }

    if (routingAttemptId) {
      const { data: attempt, error: attemptError } = await admin
        .from('call_routing_attempts')
        .select('id')
        .eq('id', routingAttemptId)
        .eq('organization_id', organizationId)
        .eq('call_id', callId)
        .maybeSingle()
      if (attemptError) {
        console.error('Unable to validate routing attempt:', attemptError)
        return new Response('Temporary failure', { status: 500 })
      }
      if (!attempt) return new Response('OK')
    }

    if (status === 'connected' && routingAttemptId && userId) {
      const { data: claimed, error: claimError } = await admin.rpc('claim_inbound_call_answer', {
        target_organization: organizationId,
        target_attempt: routingAttemptId,
        target_user: userId,
        child_provider_call_id: providerChildCallId,
      })
      if (claimError) {
        console.error('Inbound answer ownership claim failed:', claimError)
        return new Response('Temporary failure', { status: 500 })
      }
      if (claimed === false) return new Response('OK')

      if (sourceRingGroupId) {
        const { error } = await admin.rpc('mark_ring_group_member_answered', {
          target_organization: organizationId,
          target_ring_group: sourceRingGroupId,
          target_user: userId,
        })
        if (error) console.error('Unable to update ring-group answer statistics:', error)
      }
    }

    if (queueReservationId && status === 'connected') {
      await completeQueueReservation({
        organizationId,
        reservationId: queueReservationId,
        providerChildCallId,
      }).catch((error) => console.error('Unable to complete queue reservation:', error))
    }

    if (queueReservationId && (status === 'failed' || status === 'cancelled')) {
      await releaseQueueReservation({
        organizationId,
        reservationId: queueReservationId,
        reason: providerStatus || status,
        requeue: true,
      }).catch((error) => console.error('Unable to requeue failed reservation:', error))
    }

    if (userId && status === 'connected') {
      await setAgentCallActivity({ organizationId, userId, state: 'busy', callId }).catch((error) =>
        console.error('Unable to mark answering agent busy:', error),
      )
    }

    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      status,
      updated_at: now,
    }
    if (providerChildCallId) update.provider_child_call_sid = providerChildCallId
    if (terminalStatuses.has(status)) {
      update.ownership_status = 'released'
      update.ownership_expires_at = null
      update.ended_at = now
      update.duration_seconds = duration
    }

    const { error: updateError } = await admin
      .from('calls')
      .update(update)
      .eq('id', callId)
      .eq('organization_id', organizationId)
    if (updateError) {
      console.error('Unable to update call status:', updateError)
      return new Response('Temporary failure', { status: 500 })
    }

    if (terminalStatuses.has(status)) {
      const { error } = await admin.rpc('finalize_call_ownership', {
        target_organization: organizationId,
        target_call: callId,
        target_reason: providerStatus || status,
      })
      if (error) console.error('Unable to finalize call ownership:', error)
    }

    if (userId && terminalStatuses.has(status)) {
      await setAgentCallActivity({
        organizationId,
        userId,
        state: 'wrap_up',
        callId,
        wrapUpSeconds: 30,
      }).catch((error) => console.error('Unable to start agent wrap-up:', error))
    }

    if (routingAttemptId) {
      const attemptStatus = status === 'connected' ? 'answered' : terminalStatuses.has(status) ? status : 'ringing'
      const attemptUpdate: Record<string, unknown> = { status: attemptStatus, updated_at: now }
      if (terminalStatuses.has(status)) attemptUpdate.completed_at = now

      const [{ error: attemptUpdateError }, { error: historyError }] = await Promise.all([
        admin
          .from('call_routing_attempts')
          .update(attemptUpdate)
          .eq('id', routingAttemptId)
          .eq('organization_id', organizationId)
          .eq('call_id', callId),
        admin.from('call_routing_history').insert({
          organization_id: organizationId,
          call_id: callId,
          routing_attempt_id: routingAttemptId,
          event_type: `provider_${providerStatus || 'unknown'}`,
          to_status: attemptStatus,
          user_id: userId,
          provider_call_id: providerChildCallId,
          metadata: { durationSeconds: duration },
        }),
      ])
      if (attemptUpdateError) console.error('Unable to update routing attempt:', attemptUpdateError)
      if (historyError) console.error('Unable to record routing history:', historyError)
    }

    return new Response('OK')
  } catch (error) {
    console.error('Call status callback failed:', error)
    return new Response('Temporary failure', { status: 500 })
  }
}
