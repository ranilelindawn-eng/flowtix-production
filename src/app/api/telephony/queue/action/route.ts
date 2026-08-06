import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  try {
    const form = await parseTwilioForm(request)
    const url = new URL(request.url)
    const organizationId = url.searchParams.get('organizationId')
    const queueEntryId = url.searchParams.get('queueEntryId')
    const queueId = url.searchParams.get('queueId')
    if (!organizationId) return new Response('Forbidden', { status: 403 })

    const config = await getOrganizationTwilioConfiguration(organizationId)
    if (!validateTwilioWebhook(request, form, config.authToken)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!queueEntryId) return new Response('OK')

    const queueResult = (form.get('QueueResult') ?? '').toLowerCase()
    const status = queueResult === 'bridged' ? 'completed' : 'abandoned'
    const terminalAt = new Date().toISOString()
    const admin = createTelephonyAdminClient()
    const update: Record<string, unknown> = { status, updated_at: terminalAt }
    if (status === 'completed') update.completed_at = terminalAt
    else update.abandoned_at = terminalAt

    const { data: updated, error: updateError } = await admin
      .from('call_queue_entries')
      .update(update)
      .eq('organization_id', organizationId)
      .eq('id', queueEntryId)
      .in('status', ['waiting', 'reserved', 'connecting'])
      .select('id, queue_id')
      .maybeSingle()
    if (updateError) {
      console.error('Unable to finalize queue entry:', updateError)
      return new Response('Temporary failure', { status: 500 })
    }

    const effectiveQueueId = updated?.queue_id ?? queueId
    if (effectiveQueueId) {
      const { error: refreshError } = await admin.rpc('refresh_call_queue_positions', {
        target_organization: organizationId,
        target_queue: effectiveQueueId,
      })
      if (refreshError) {
        console.error('Unable to refresh queue positions:', refreshError)
        return new Response('Temporary failure', { status: 500 })
      }
    }
    return new Response('OK')
  } catch (error) {
    console.error('Queue action callback failed:', error)
    return new Response('Temporary failure', { status: 500 })
  }
}
