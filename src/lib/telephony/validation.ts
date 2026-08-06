import twilio from 'twilio'

export async function parseTwilioForm(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    throw new Error('Twilio webhooks must use application/x-www-form-urlencoded payloads.')
  }

  const text = await request.text()
  if (text.length > 256_000) throw new Error('The Twilio webhook payload is too large.')
  return new URLSearchParams(text)
}

function externalRequestUrl(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host')?.trim()

  if (host) {
    const protocol = forwardedProto || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    const source = new URL(request.url)
    return `${protocol}://${host}${source.pathname}${source.search}`
  }

  return request.url
}

export function validateTwilioWebhook(
  request: Request,
  form: URLSearchParams,
  authToken: string,
): boolean {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === 'true'
  ) {
    return true
  }

  const signature = request.headers.get('x-twilio-signature')?.trim() ?? ''
  if (!signature || !authToken.trim()) return false

  const params = Object.fromEntries(form.entries())
  return twilio.validateRequest(authToken, signature, externalRequestUrl(request), params)
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
