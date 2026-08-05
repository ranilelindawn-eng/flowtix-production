import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

export type PayMongoSignatureResult = {
  valid: boolean
  timestamp: number | null
  mode: 'live' | 'test' | null
  reason?: string
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyPayMongoSignature(input: {
  rawBody: string
  signatureHeader: string | null
  webhookSecret: string
  toleranceSeconds?: number
}): PayMongoSignatureResult {
  const values = new Map<string, string>()
  for (const component of input.signatureHeader?.split(',') ?? []) {
    const [key, ...rest] = component.trim().split('=')
    if (key && rest.length) values.set(key, rest.join('='))
  }

  const timestampText = values.get('t')
  const timestamp = timestampText ? Number(timestampText) : Number.NaN
  if (!Number.isFinite(timestamp)) {
    return { valid: false, timestamp: null, mode: null, reason: 'missing_timestamp' }
  }

  const toleranceSeconds = input.toleranceSeconds ?? 300
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) {
    return { valid: false, timestamp, mode: null, reason: 'timestamp_outside_tolerance' }
  }

  const signedPayload = `${timestamp}.${input.rawBody}`
  const expected = createHmac('sha256', input.webhookSecret)
    .update(signedPayload)
    .digest('hex')

  const live = values.get('li')
  if (live && secureEqual(live, expected)) {
    return { valid: true, timestamp, mode: 'live' }
  }

  const test = values.get('te')
  if (test && secureEqual(test, expected)) {
    return { valid: true, timestamp, mode: 'test' }
  }

  return { valid: false, timestamp, mode: null, reason: 'signature_mismatch' }
}
