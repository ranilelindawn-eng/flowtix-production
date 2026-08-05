import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
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

  const queueResult = form.get('QueueResult') ?? ''
  const status = queueResult === 'bridged' ? 'completed' : 'abandoned'
  const terminalAt = new Date().toISOString()
  const admin = createTelephonyAdminClient()
  const update: Record<string, unknown> = { status, updated_at: terminalAt }
  if (status === 'completed') update.completed_at = terminalAt
  else update.abandoned_at = terminalAt

  await admin
    .from('call_queue_entries')
    .update(update)
    .eq('organization_id', organizationId)
    .eq('id', queueEntryId)

  if (queueId) {
    await admin.rpc('refresh_call_queue_positions', {
      target_organization: organizationId,
      target_queue: queueId,
    })
  }
  return new Response('OK')
}
