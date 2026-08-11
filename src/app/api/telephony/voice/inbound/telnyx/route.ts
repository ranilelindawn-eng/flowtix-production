import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'
import { buildProviderInboundRoute, normalizeE164, primaryTargets, resolveOwnedInboundNumber } from '@/lib/telephony/inbound/provider-routing'
import { externalRequestUrl } from '@/lib/telephony/validation'
import { verifyProviderCallWebhook } from '@/lib/telephony/normalization/verification'

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) return new Response('Bad Request', { status: 400 })
  const rawBody = await request.text()
  const parsed = object(JSON.parse(rawBody))
  const data = object(parsed.data)
  const payload = object(data.payload)
  const eventType = text(data.event_type)
  const called = normalizeE164(text(payload.to))
  const from = normalizeE164(text(payload.from))
  const providerCallId = text(payload.call_control_id || payload.call_leg_id)
  if (!called || !from || !providerCallId) return Response.json({ ok: true, ignored: true })

  const owned = await resolveOwnedInboundNumber({ provider: 'telnyx', calledNumber: called })
  if (!owned) return Response.json({ ok: true, ignored: true })
  if (!(await verifyProviderCallWebhook({
    provider: 'telnyx',
    organizationId: owned.organization_id,
    requestUrl: externalRequestUrl(request),
    headers: request.headers,
    rawBody,
    contentType,
  }))) return new Response('Forbidden', { status: 403 })

  if (eventType !== 'call.initiated') return Response.json({ ok: true })

  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(owned.organization_id, 'telnyx')
  const apiKey = text(connection.credentials.apiKey)
  const connectionId = text(connection.config.connection_id)
  if (!apiKey || !connectionId) throw new Error('Telnyx API key and Credential Connection ID are required.')

  const route = await buildProviderInboundRoute({
    provider: 'telnyx', organizationId: owned.organization_id, providerCallId, fromNumber: from, toNumber: called,
  })
  const targets = primaryTargets(route.targets)
  if (!targets.length) {
    await fetch(`https://api.telnyx.com/v2/calls/${encodeURIComponent(providerCallId)}/actions/hangup`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    return Response.json({ ok: true, routed: false })
  }

  // Telnyx Voice SDK users authenticate with per-user telephony credentials.
  // The provider identities are stored on online agent devices by the browser token route.
  const adminModule = await import('@/lib/telephony/admin')
  const admin = adminModule.createTelephonyAdminClient()
  const userIds = targets.map((target) => target.userId).filter((id): id is string => Boolean(id))
  const { data: devices } = await admin
    .from('agent_devices')
    .select('user_id,provider_identity')
    .eq('organization_id', owned.organization_id)
    .eq('provider', 'telnyx')
    .eq('status', 'online')
    .in('user_id', userIds)

  const identities = new Map((devices ?? []).map((row) => [row.user_id, row.provider_identity]))
  const destinations = targets
    .map((target) => target.kind === 'number' ? target.phoneNumber : identities.get(target.userId ?? '') ?? null)
    .filter((value): value is string => Boolean(value))

  if (!destinations.length) return Response.json({ ok: true, routed: false })

  // Answer the inbound leg and bridge to the first eligible per-user SIP identity.
  await fetch(`https://api.telnyx.com/v2/calls/${encodeURIComponent(providerCallId)}/actions/answer`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: '{}',
  })

  const destination = destinations[0]
  const to = destination.startsWith('+') ? destination : `sip:${destination}`
  const dial = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection_id: connectionId,
      to,
      from: called,
      webhook_url: `${new URL(externalRequestUrl(request)).origin}/api/telephony/voice/inbound/telnyx`,
      webhook_url_method: 'POST',
      client_state: Buffer.from(JSON.stringify({
        organizationId: owned.organization_id,
        inboundCallControlId: providerCallId,
        routingAttemptId: route.routingAttemptId,
      })).toString('base64'),
    }),
  })
  if (!dial.ok) throw new Error(`Telnyx agent dial failed: ${await dial.text()}`)
  return Response.json({ ok: true, routed: true })
}
