import {
  applyDeliveryEvent,
  findCommunicationMessage,
  normalizeFormDeliveryEvent,
  normalizeResendDeliveryEvent,
  normalizeTelnyxDeliveryEvent,
  validateCallbackToken,
  validateResendSignature,
  validateTelnyxSignature,
  validateTwilioCompatibleSignature,
  type DeliveryProvider,
} from '@/lib/communications/delivery-status'
import type {
  ConfiguredTelephonyProviderName,
} from '@/lib/telephony/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const providers = new Set<DeliveryProvider>([
  'twilio',
  'telnyx',
  'signalwire',
  'plivo',
  'resend',
])

function json(
  payload: Record<string, unknown>,
  status = 200,
) {
  return Response.json(payload, { status })
}

function parseJson(rawBody: string) {
  const parsed = JSON.parse(rawBody) as unknown

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error('The webhook body must be a JSON object.')
  }

  return parsed as Record<string, unknown>
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ provider: string }>
  },
) {
  const { provider: rawProvider } = await context.params
  const provider = rawProvider.toLowerCase() as DeliveryProvider

  if (!providers.has(provider)) {
    return json({ error: 'Unsupported provider.' }, 404)
  }

  try {
    const requestUrl = new URL(request.url)

    if (provider === 'resend') {
      const rawBody = await request.text()
      const eventId = request.headers.get('svix-id') ?? ''
      const timestamp =
        request.headers.get('svix-timestamp') ?? ''
      const signature =
        request.headers.get('svix-signature') ?? ''

      if (
        !validateResendSignature({
          rawBody,
          eventId,
          timestamp,
          signatureHeader: signature,
        })
      ) {
        return json({ error: 'Invalid webhook signature.' }, 401)
      }

      const event = normalizeResendDeliveryEvent(
        parseJson(rawBody),
        eventId,
      )

      const message = await findCommunicationMessage({
        provider,
        providerMessageId: event.providerMessageId,
      })

      if (!message) {
        return json({ ok: true, ignored: true })
      }

      await applyDeliveryEvent({
        provider,
        messageId: message.id,
        event,
      })

      return json({ ok: true })
    }

    const messageId =
      requestUrl.searchParams.get('messageId')
    const token = requestUrl.searchParams.get('token') ?? ''

    if (
      !messageId ||
      !validateCallbackToken({
        provider: provider as ConfiguredTelephonyProviderName,
        messageId,
        token,
      })
    ) {
      return json({ error: 'Invalid callback token.' }, 401)
    }

    if (provider === 'telnyx') {
      const rawBody = await request.text()
      const signature =
        request.headers.get('telnyx-signature-ed25519') ?? ''
      const timestamp =
        request.headers.get('telnyx-timestamp') ?? ''

      if (
        !validateTelnyxSignature({
          rawBody,
          signature,
          timestamp,
        })
      ) {
        return json({ error: 'Invalid webhook signature.' }, 401)
      }

      const event = normalizeTelnyxDeliveryEvent(
        parseJson(rawBody),
      )

      await applyDeliveryEvent({
        provider,
        messageId,
        event,
      })

      return json({ ok: true })
    }

    const rawBody = await request.text()
    const form = new URLSearchParams(rawBody)
    const message = await findCommunicationMessage({
      messageId,
      provider,
      providerMessageId:
        form.get('MessageSid') ||
        form.get('MessageUUID') ||
        form.get('MessageUuid') ||
        form.get('message_uuid') ||
        '',
    })

    if (!message) {
      return json({ ok: true, ignored: true })
    }

    if (provider === 'twilio' || provider === 'signalwire') {
      const signature =
        request.headers.get('x-twilio-signature') ||
        request.headers.get('x-signalwire-signature') ||
        ''

      const valid =
        await validateTwilioCompatibleSignature({
          requestUrl: request.url,
          signature,
          form,
          organizationId: message.organization_id,
          provider,
        })

      if (!valid) {
        return json({ error: 'Invalid webhook signature.' }, 401)
      }
    }

    const event = normalizeFormDeliveryEvent(
      provider as 'twilio' | 'signalwire' | 'plivo',
      form,
    )

    await applyDeliveryEvent({
      provider,
      messageId,
      event,
    })

    return json({ ok: true })
  } catch (error) {
    console.error('Communication delivery webhook failed:', error)

    return json(
      {
        error: 'Unable to process the delivery event.',
      },
      500,
    )
  }
}
