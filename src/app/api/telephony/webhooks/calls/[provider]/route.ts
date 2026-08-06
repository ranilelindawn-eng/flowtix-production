import { createTelephonyAdminClient } from '@/lib/telephony/admin'
import { normalizeProviderWebhook } from '@/lib/telephony/normalization/adapters'
import { applyNormalizedCallEvent } from '@/lib/telephony/normalization/service'
import { verifyProviderCallWebhook } from '@/lib/telephony/normalization/verification'
import { isTelephonyProvider } from '@/lib/telephony/provider'

function parsePayload(rawBody: string, contentType: string): Record<string, unknown> | null {
  try {
    if (/json/i.test(contentType)) {
      const parsed: unknown = rawBody ? JSON.parse(rawBody) : {}
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    }
    return Object.fromEntries(new URLSearchParams(rawBody).entries())
  } catch {
    return null
  }
}

function extractCalledNumber(payload: Record<string, unknown>): string {
  const nestedData = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {}
  const nestedPayload = nestedData.payload && typeof nestedData.payload === 'object' && !Array.isArray(nestedData.payload)
    ? (nestedData.payload as Record<string, unknown>)
    : {}
  const value = payload.To ?? payload.to ?? nestedPayload.to ?? nestedPayload.to_number
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params
  if (!isTelephonyProvider(provider)) {
    return Response.json({ error: 'Unsupported telephony provider.' }, { status: 404 })
  }

  const rawBody = await request.text()
  const contentType = request.headers.get('content-type') ?? ''
  const payload = parsePayload(rawBody, contentType)
  if (!payload) {
    return Response.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  const queryOrganizationId = new URL(request.url).searchParams.get('organizationId')?.trim() ?? ''
  const calledNumber = extractCalledNumber(payload)
  const admin = createTelephonyAdminClient()
  const { data: ownedNumber, error: ownedNumberError } = calledNumber
    ? await admin
        .from('organization_phone_numbers')
        .select('organization_id')
        .eq('provider', provider)
        .eq('phone_number', calledNumber)
        .maybeSingle()
    : { data: null, error: null }

  if (ownedNumberError) {
    console.error('Unable to resolve telephony webhook organization:', ownedNumberError)
    return Response.json({ error: 'Unable to resolve webhook organization.' }, { status: 500 })
  }

  if (
    queryOrganizationId &&
    ownedNumber?.organization_id &&
    queryOrganizationId !== ownedNumber.organization_id
  ) {
    return Response.json({ error: 'Webhook organization mismatch.' }, { status: 403 })
  }

  const organizationId = ownedNumber?.organization_id || queryOrganizationId
  if (!organizationId) {
    return Response.json({ error: 'Unable to resolve webhook organization.' }, { status: 403 })
  }

  let valid = false
  try {
    valid = await verifyProviderCallWebhook({
      provider,
      organizationId,
      requestUrl: request.url,
      headers: request.headers,
      rawBody,
      contentType,
    })
  } catch (error) {
    console.error('Telephony webhook signature verification failed:', error)
    return Response.json({ error: 'Unable to verify webhook signature.' }, { status: 500 })
  }
  if (!valid) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let event
  try {
    event = normalizeProviderWebhook({ provider, rawBody, contentType })
  } catch (error) {
    console.error('Unable to normalize telephony webhook:', error)
    return Response.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  if (!event.providerCallId) {
    return Response.json({ ok: true, ignored: true })
  }

  try {
    const result = await applyNormalizedCallEvent({ organizationId, event })
    return Response.json({ ok: true, duplicate: result.duplicate, callId: result.callId })
  } catch (error) {
    console.error('Unable to process telephony webhook:', error)
    return Response.json({ error: 'Unable to process webhook.' }, { status: 500 })
  }
}
