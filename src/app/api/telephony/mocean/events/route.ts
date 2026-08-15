import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { verifyMoceanEventSignature } from '@/lib/telephony/mocean'

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }

async function payloadFrom(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json')) {
    const value = await request.json().catch(() => ({}))
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  }
  const form = await request.formData().catch(() => null)
  return form ? Object.fromEntries(form.entries()) : {}
}

function field(payload: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = text(payload[name])
    if (value) return value
  }
  return ''
}

function normalizeStatus(raw: string): 'ringing' | 'connected' | 'completed' | 'failed' | 'cancelled' | null {
  const value = raw.toLowerCase().replace(/[_\s]+/g, '-')
  if (['answered','answer','connected','in-progress','inprogress'].includes(value)) return 'connected'
  if (['ringing','initiated','calling','queued'].includes(value)) return 'ringing'
  if (['hangup','hungup','completed','complete','ended','disconnected'].includes(value)) return 'completed'
  if (['busy','failed','failure','unreachable','no-answer','noanswer','rejected'].includes(value)) return 'failed'
  if (['cancelled','canceled'].includes(value)) return 'cancelled'
  return null
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const callId = url.searchParams.get('callId')?.trim() ?? ''
    const signature = url.searchParams.get('sig')?.trim() ?? ''
    if (!verifyMoceanEventSignature(callId, signature)) return new Response('Forbidden', { status: 403 })

    const payload = await payloadFrom(request)
    const rawStatus = field(payload, 'mocean-call-status', 'mocean-status', 'call_status', 'call-status', 'status', 'event', 'type')
    const status = normalizeStatus(rawStatus)
    const callUuid = field(payload, 'mocean-call-uuid', 'call_uuid', 'call-uuid')
    const sessionUuid = field(payload, 'mocean-session-uuid', 'session_uuid', 'session-uuid')
    const durationRaw = field(payload, 'mocean-duration', 'duration', 'call_duration', 'call-duration')
    const duration = Number(durationRaw)

    const admin = createTelephonyAdminClient()
    const { data: call, error } = await admin.from('calls')
      .select('id,status,organization_id,created_by,provider_call_sid,metadata')
      .eq('id', callId).eq('provider', 'mocean').maybeSingle()
    if (error) return new Response('Temporary failure', { status: 500 })
    if (!call) return new Response('OK')

    const terminal = new Set(['completed','failed','cancelled'])
    if (status && !(terminal.has(call.status) && !terminal.has(status))) {
      const now = new Date().toISOString()
      const update: Record<string, unknown> = {
        status,
        provider_status_raw: rawStatus || status,
        provider_event_at: now,
        updated_at: now,
      }
      if (callUuid && !call.provider_call_sid) update.provider_call_sid = callUuid
      if (sessionUuid) update.provider_child_call_sid = sessionUuid
      if (terminal.has(status)) {
        update.ended_at = now
        if (Number.isFinite(duration) && duration >= 0) update.duration_seconds = Math.round(duration)
      }
      await admin.from('calls').update(update).eq('id', call.id).eq('organization_id', call.organization_id)

      const metadata = call.metadata && typeof call.metadata === 'object' ? call.metadata as Record<string, unknown> : {}
      if (terminal.has(status) && metadata.record_requested === true && (callUuid || call.provider_call_sid)) {
        const recordingId = callUuid || call.provider_call_sid
        const { error: recordingError } = await admin.from('call_recordings').upsert({
          organization_id: call.organization_id,
          call_id: call.id,
          provider: 'mocean',
          provider_recording_sid: recordingId,
          provider_url: 'https://rest.moceanapi.com/rest/2/voice/rec',
          status: 'completed',
          created_by: call.created_by,
          updated_at: now,
        }, { onConflict: 'provider_recording_sid' })
        if (!recordingError) {
          await admin.from('calls').update({ recording_available: true, updated_at: now }).eq('id', call.id)
        }
      }
    }
    return new Response('OK')
  } catch (error) {
    console.error('Mocean call event processing failed:', error)
    return new Response('Temporary failure', { status: 500 })
  }
}

export async function GET(request: Request) { return POST(request) }
