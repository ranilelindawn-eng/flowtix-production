import twilio from 'twilio'
import { getTwilioConfiguration } from './config'

export async function parseTwilioForm(request: Request): Promise<URLSearchParams> {
  const text = await request.text()
  return new URLSearchParams(text)
}

export function validateTwilioWebhook(request: Request, form: URLSearchParams): boolean {
  if (process.env.NODE_ENV !== 'production' && process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === 'true') {
    return true
  }
  const config = getTwilioConfiguration()
  const signature = request.headers.get('x-twilio-signature') ?? ''
  const params = Object.fromEntries(form.entries())
  return twilio.validateRequest(config.authToken, signature, request.url, params)
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}
