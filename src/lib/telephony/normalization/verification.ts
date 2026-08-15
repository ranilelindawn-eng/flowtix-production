import { createHmac, timingSafeEqual } from 'node:crypto'

import { getOrganizationProviderConnection } from '@/lib/telephony/provider-connections'
import type { ConfiguredTelephonyProviderName } from '@/lib/telephony/provider'

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function expectedFormSignature(authToken: string, requestUrl: string, rawBody: string): string {
  const form = new URLSearchParams(rawBody)
  const sorted = [...form.entries()].sort(([left], [right]) => left.localeCompare(right))
  const payload = sorted.reduce((value, [key, fieldValue]) => `${value}${key}${fieldValue}`, requestUrl)
  return createHmac('sha1', authToken).update(payload).digest('base64')
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
    'signalwire',
  )
  const authToken = String(connection.credentials.apiToken ?? '')
  const signature =
    input.headers.get('x-signalwire-signature') ||
    ''

  if (!authToken || !signature) return false
  return safeEqual(signature, expectedFormSignature(authToken, input.requestUrl, input.rawBody))
}
