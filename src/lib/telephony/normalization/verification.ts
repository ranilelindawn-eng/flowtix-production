import { createHmac, timingSafeEqual, verify } from 'node:crypto'
import twilio from 'twilio'

import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'
import type { ConfiguredTelephonyProviderName } from '@/lib/telephony/provider'

const MAX_WEBHOOK_AGE_SECONDS = 300

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function isFreshUnixTimestamp(value: string): boolean {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return false
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp)
  return ageSeconds <= MAX_WEBHOOK_AGE_SECONDS
}

export async function verifyProviderCallWebhook(input: {
  provider: ConfiguredTelephonyProviderName
  organizationId: string
  requestUrl: string
  headers: Headers
  rawBody: string
  contentType: string
}): Promise<boolean> {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.TELEPHONY_SKIP_SIGNATURE_VALIDATION === 'true'
  ) {
    return true
  }

  const connection = await getOrganizationProviderConnection<Record<string, unknown>>(
    input.organizationId,
    input.provider,
  )

  if (input.provider === 'twilio' || input.provider === 'signalwire') {
    const tokenKey = input.provider === 'twilio' ? 'authToken' : 'apiToken'
    const authToken = String(connection.credentials[tokenKey] ?? '')
    const signature =
      input.headers.get('x-twilio-signature') ||
      input.headers.get('x-signalwire-signature') ||
      ''
    if (!authToken || !signature) return false
    const form = Object.fromEntries(new URLSearchParams(input.rawBody).entries())
    return twilio.validateRequest(authToken, signature, input.requestUrl, form)
  }

  if (input.provider === 'telnyx') {
    const publicKey = String(
      connection.config.public_key ?? connection.credentials.publicKey ?? '',
    )
    const signature = input.headers.get('telnyx-signature-ed25519') || ''
    const timestamp = input.headers.get('telnyx-timestamp') || ''
    if (!publicKey || !signature || !timestamp || !isFreshUnixTimestamp(timestamp)) {
      return false
    }
    const key = publicKey.includes('BEGIN PUBLIC KEY')
      ? publicKey
      : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`
    try {
      return verify(
        null,
        Buffer.from(`${timestamp}|${input.rawBody}`),
        key,
        Buffer.from(signature, 'base64'),
      )
    } catch {
      return false
    }
  }

  const authToken = String(connection.credentials.authToken ?? '')
  const signature = input.headers.get('x-plivo-signature-v3') || ''
  const nonce = input.headers.get('x-plivo-signature-v3-nonce') || ''
  if (!authToken || !signature || !nonce) return false
  const digest = createHmac('sha256', authToken)
    .update(`${input.requestUrl}${nonce}`)
    .digest('base64')
  return signature
    .split(',')
    .some((candidate) => safeEqual(candidate.trim(), digest))
}
