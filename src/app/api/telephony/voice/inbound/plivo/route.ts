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
function unavailable(message: string) { return response(`<Speak>${xml(message)}</Speak><Hangup/>`) }
function targetXml(target: { kind: string; phoneNumber: string | null; userId: string | null }) {
  if (target.kind === 'number' && target.phoneNumber) {
    const number = normalizeE164(target.phoneNumber)
    return number ? `<Number>${xml(number)}</Number>` : ''
  }
  if (!target.userId) return ''
  return `<User>${xml(`fx_${target.userId.replace(/-/g, '')}`)}</User>`
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) return new Response('Bad Request', { status: 400 })
  const rawBody = await request.text()
  const form = new URLSearchParams(rawBody)
  const called = normalizeE164(form.get('To') ?? '')
  const from = normalizeE164(form.get('From') ?? '')
  const providerCallId = (form.get('CallUUID') ?? form.get('RequestUUID') ?? '').trim()
  if (!called || !from || !providerCallId) return unavailable('This call request is invalid.')

  const owned = await resolveOwnedInboundNumber({ provider: 'plivo', calledNumber: called })
  if (!owned) return unavailable('This Flowtix number is not configured for incoming voice calls.')
  if (!(await verifyProviderCallWebhook({
    provider: 'plivo',
    organizationId: owned.organization_id,
    requestUrl: externalRequestUrl(request),
    headers: request.headers,
    rawBody,
    contentType,
  }))) return new Response('Forbidden', { status: 403 })

  const route = await buildProviderInboundRoute({
    provider: 'plivo', organizationId: owned.organization_id, providerCallId, fromNumber: from, toNumber: called,
  })
  if (route.routeType === 'queue') return unavailable('The configured queue is not available on this Plivo browser route.')
  if (!route.targets.length) return unavailable('No agents are currently available.')

  const primary = primaryTargets(route.targets)
  const overflow = overflowTargets(route.targets)
  const chunks: string[] = []
  if (route.strategy === 'simultaneous') {
    const nouns = primary.map(targetXml).filter(Boolean).join('')
    if (nouns) chunks.push(`<Dial timeout="${Math.min(Math.max(route.timeoutSeconds, 5), 120)}" confirmSound="none">${nouns}</Dial>`)
  } else {
    for (const target of primary) {
      const noun = targetXml(target)
      if (noun) chunks.push(`<Dial timeout="${Math.min(Math.max(route.timeoutSeconds, 5), 120)}">${noun}</Dial>`)
    }
  }
  for (const target of overflow) {
    const noun = targetXml(target)
    if (noun) chunks.push(`<Dial timeout="20">${noun}</Dial>`)
  }
  chunks.push('<Speak>No agent answered the call.</Speak><Hangup/>')
  return response(chunks.join(''))
}
