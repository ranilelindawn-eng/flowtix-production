import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { normalizeProviderWebhook } from '@/lib/telephony/normalization/adapters'
import { applyNormalizedCallEvent } from '@/lib/telephony/normalization/service'
import { verifyProviderCallWebhook } from '@/lib/telephony/normalization/verification'
import { isTelephonyProvider } from '@/lib/telephony/provider'

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params
  if (!isTelephonyProvider(provider)) return Response.json({ error: 'Unsupported telephony provider.' }, { status: 404 })
  const rawBody = await request.text()
  const contentType = request.headers.get('content-type') ?? ''
  const payload = /json/i.test(contentType) ? JSON.parse(rawBody || '{}') as Record<string, unknown> : Object.fromEntries(new URLSearchParams(rawBody).entries())
  const queryOrganizationId = new URL(request.url).searchParams.get('organizationId')
  const calledNumber = String(payload.To ?? payload.to ?? (payload.data as { payload?: { to?: string } } | undefined)?.payload?.to ?? '')
  const admin = createTelephonyAdminClient()
  const { data: ownedNumber } = calledNumber ? await admin.from('organization_phone_numbers').select('organization_id').eq('provider', provider).eq('phone_number', calledNumber).maybeSingle() : { data: null }
  const organizationId = queryOrganizationId || ownedNumber?.organization_id || ''
  if (!organizationId) return Response.json({ error: 'Unable to resolve webhook organization.' }, { status: 403 })
  const valid = await verifyProviderCallWebhook({ provider, organizationId, requestUrl: request.url, headers: request.headers, rawBody, contentType })
  if (!valid) return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  const event = normalizeProviderWebhook({ provider, rawBody, contentType })
  if (!event.providerCallId) return Response.json({ ok: true, ignored: true })
  const result = await applyNormalizedCallEvent({ organizationId, event })
  return Response.json({ ok: true, duplicate: result.duplicate, callId: result.callId })
}
