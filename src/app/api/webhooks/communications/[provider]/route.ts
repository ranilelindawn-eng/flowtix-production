import {
  applyDeliveryEvent,
  findCommunicationMessage,
  normalizeFormDeliveryEvent,
  normalizeResendDeliveryEvent,
  validateCallbackToken,
  validateResendSignature,
  type DeliveryProvider,
} from '@/lib/communications/delivery-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const providers = new Set<DeliveryProvider>(['signalwire', 'resend'])

function json(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, { status })
}

function parseJson(rawBody: string) {
  const parsed = JSON.parse(rawBody) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The webhook body must be a JSON object.')
  }
  return parsed as Record<string, unknown>
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params
  const provider = rawProvider.toLowerCase() as DeliveryProvider

  if (!providers.has(provider)) {
    return json({ error: 'This communications provider has been retired.' }, 410)
  }

  try {
    const requestUrl = new URL(request.url)

    if (provider === 'resend') {
      const rawBody = await request.text()
      const eventId = request.headers.get('svix-id') ?? ''
      const timestamp = request.headers.get('svix-timestamp') ?? ''
      const signature = request.headers.get('svix-signature') ?? ''

      if (!validateResendSignature({ rawBody, eventId, timestamp, signatureHeader: signature })) {
        return json({ error: 'Invalid webhook signature.' }, 401)
      }

      const event = normalizeResendDeliveryEvent(parseJson(rawBody), eventId)
      const message = await findCommunicationMessage({
        provider,
        providerMessageId: event.providerMessageId,
      })

      if (!message) return json({ ok: true, ignored: true })

      await applyDeliveryEvent({ provider, messageId: message.id, event })
      return json({ ok: true })
    }

    const messageId = requestUrl.searchParams.get('messageId')
    const token = requestUrl.searchParams.get('token') ?? ''

    if (!messageId || !validateCallbackToken({ provider: 'signalwire', messageId, token })) {
      return json({ error: 'Invalid callback token.' }, 401)
    }

    const rawBody = await request.text()
    const form = new URLSearchParams(rawBody)
    const message = await findCommunicationMessage({
      messageId,
      provider: 'signalwire',
      providerMessageId:
        form.get('MessageSid') ||
        form.get('MessageUUID') ||
        form.get('MessageUuid') ||
        form.get('message_uuid') ||
        '',
    })

    if (!message) return json({ ok: true, ignored: true })

    const event = normalizeFormDeliveryEvent('signalwire', form)
    await applyDeliveryEvent({ provider: 'signalwire', messageId, event })

    return json({ ok: true })
  } catch (error) {
    console.error('Communication delivery webhook failed:', error)
    return json({ error: 'Unable to process the delivery event.' }, 500)
  }
}
