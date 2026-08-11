import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'
import { buildProviderInboundRoute, normalizeE164, overflowTargets, primaryTargets, resolveOwnedInboundNumber } from '@/lib/telephony/inbound/provider-routing'
import { externalRequestUrl } from '@/lib/telephony/validation'
import { verifyProviderCallWebhook } from '@/lib/telephony/normalization/verification'

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}
function response(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
function unavailable(message: string) { return response(`<Say>${xml(message)}</Say><Hangup/>`) }
function vertoDomain(spaceUrl: string) {
  const host = new URL(/^https?:\/\//i.test(spaceUrl) ? spaceUrl : `https://${spaceUrl}`).hostname
  return host.endsWith('.signalwire.com')
    ? `${host.slice(0, -'.signalwire.com'.length)}.verto.signalwire.com`
    : `${host}.verto.signalwire.com`
}
function targetXml(target: { kind: string; phoneNumber: string | null; userId: string | null }, domain: string) {
  if (target.kind === 'number' && target.phoneNumber) {
    const number = normalizeE164(target.phoneNumber)
    return number ? `<Number>${xml(number)}</Number>` : ''
  }
  if (!target.userId) return ''
  return `<Verto>${xml(`fx_${target.userId.replace(/-/g, '')}@${domain}`)}</Verto>`
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) return new Response('Bad Request', { status: 400 })
  const rawBody = await request.text()
  const form = new URLSearchParams(rawBody)
  const called = normalizeE164(form.get('To') ?? '')
  const from = normalizeE164(form.get('From') ?? '')
  const providerCallId = (form.get('CallSid') ?? '').trim()
  if (!called || !from || !providerCallId) return unavailable('This call request is invalid.')

  const owned = await resolveOwnedInboundNumber({ provider: 'signalwire', calledNumber: called })
  if (!owned) return unavailable('This Flowtix number is not configured for incoming voice calls.')
  if (!(await verifyProviderCallWebhook({
    provider: 'signalwire',
    organizationId: owned.organization_id,
    requestUrl: externalRequestUrl(request),
    headers: request.headers,
    rawBody,
    contentType,
  }))) return new Response('Forbidden', { status: 403 })

  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(owned.organization_id, 'signalwire')
  const spaceUrl = String(connection.config.space_url ?? '').trim()
  if (!spaceUrl) return unavailable('The SignalWire Space URL is not configured.')
  const domain = vertoDomain(spaceUrl)
  const route = await buildProviderInboundRoute({
    provider: 'signalwire', organizationId: owned.organization_id, providerCallId, fromNumber: from, toNumber: called,
  })
  if (route.routeType === 'queue') return unavailable('The configured queue is not available on this SignalWire browser route.')
  if (!route.targets.length) return unavailable('No agents are currently available.')

  const primary = primaryTargets(route.targets)
  const overflow = overflowTargets(route.targets)
  const chunks: string[] = []
  if (route.strategy === 'simultaneous') {
    const nouns = primary.map((t) => targetXml(t, domain)).filter(Boolean).join('')
    if (nouns) chunks.push(`<Dial timeout="${Math.min(Math.max(route.timeoutSeconds, 5), 120)}" answerOnBridge="true">${nouns}</Dial>`)
  } else {
    for (const target of primary) {
      const noun = targetXml(target, domain)
      if (noun) chunks.push(`<Dial timeout="${Math.min(Math.max(route.timeoutSeconds, 5), 120)}" answerOnBridge="true">${noun}</Dial>`)
    }
  }
  for (const target of overflow) {
    const noun = targetXml(target, domain)
    if (noun) chunks.push(`<Dial timeout="20" answerOnBridge="true">${noun}</Dial>`)
  }
  chunks.push('<Say>No agent answered the call.</Say><Hangup/>')
  return response(chunks.join(''))
}
