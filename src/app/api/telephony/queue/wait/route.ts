import twilio from 'twilio'

import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { getOrganizationTwilioConfiguration } from '@/lib/telephony/config'
import { parseTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/telephony/validation'

export async function POST(request: Request) {
  try {
    const form = await parseTwilioForm(request)
    const url = new URL(request.url)
    const organizationId = url.searchParams.get('organizationId')
    const queueEntryId = url.searchParams.get('queueEntryId')
    if (!organizationId) return new Response('Forbidden', { status: 403 })

    const config = await getOrganizationTwilioConfiguration(organizationId)
    if (!validateTwilioWebhook(request, form, config.authToken)) {
      return new Response('Forbidden', { status: 403 })
    }

    const response = new twilio.twiml.VoiceResponse()
    if (!queueEntryId) {
      response.say('Please stay on the line for the next available agent.')
      response.pause({ length: 15 })
      return twimlResponse(response.toString())
    }

    const admin = createTelephonyAdminClient()
    const { data: entry, error } = await admin
      .from('call_queue_entries')
      .select('position, estimated_wait_seconds, status, call_queues(announce_position, announce_estimated_wait)')
      .eq('organization_id', organizationId)
      .eq('id', queueEntryId)
      .maybeSingle()
    if (error) {
      console.error('Unable to load queue wait state:', error)
      response.say('Please stay on the line for the next available agent.')
      response.pause({ length: 15 })
      return twimlResponse(response.toString())
    }

    const queueSettings = entry?.call_queues as
      | { announce_position?: boolean; announce_estimated_wait?: boolean }
      | Array<{ announce_position?: boolean; announce_estimated_wait?: boolean }>
      | null
    const settings = Array.isArray(queueSettings) ? queueSettings[0] : queueSettings

    if (entry?.status === 'waiting') {
      if (settings?.announce_position !== false && typeof entry.position === 'number') {
        response.say(`Your position in the queue is ${entry.position}.`)
      }
      if (
        settings?.announce_estimated_wait !== false &&
        typeof entry.estimated_wait_seconds === 'number' &&
        entry.estimated_wait_seconds > 0
      ) {
        const minutes = Math.max(1, Math.ceil(entry.estimated_wait_seconds / 60))
        response.say(`Your estimated wait time is approximately ${minutes} minute${minutes === 1 ? '' : 's'}.`)
      }
      response.pause({ length: 15 })
      return twimlResponse(response.toString())
    }

    // Stop Twilio from repeatedly requesting wait media after the entry becomes terminal.
    response.say('Thank you for calling.')
    response.hangup()
    return twimlResponse(response.toString())
  } catch (error) {
    console.error('Queue wait callback failed:', error)
    return new Response('Temporary failure', { status: 500 })
  }
}
