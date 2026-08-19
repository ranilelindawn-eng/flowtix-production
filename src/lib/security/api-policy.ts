import { isIP } from 'node:net'

export type ApiSecurityPolicy = {
  requestsPerMinute: number
  requireIdempotencyForWrites: boolean
  blockAnonymousApi: boolean
  allowedOrigins: string[]
  allowedIpCidrs: string[]
}

export const DEFAULT_API_SECURITY_POLICY: ApiSecurityPolicy = {
  requestsPerMinute: 120,
  requireIdempotencyForWrites: true,
  blockAnonymousApi: true,
  allowedOrigins: [],
  allowedIpCidrs: [],
}

const TRUSTED_API_PREFIXES = [
  '/api/internal/',
  '/api/cron/',
  '/api/webhooks/',
  '/api/telephony/webhooks/',
  '/api/telephony/voice/inbound',
  '/api/telephony/status',
  '/api/telephony/recording',
  '/api/paymongo/webhook',
  '/api/health/',
]

const TRUSTED_API_EXACT = new Set([
  '/api/integrations/google/callback',
  '/api/integrations/oauth/callback',
])

const PUBLIC_API_EXACT = new Set(['/api/contact'])

export function isTrustedApiPath(pathname: string) {
  return (
    TRUSTED_API_EXACT.has(pathname) ||
    TRUSTED_API_PREFIXES.some(
      (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
    )
  )
}

export function isPublicApiPath(pathname: string) {
  return PUBLIC_API_EXACT.has(pathname)
}

export function normalizeOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return []
    const trimmed = entry.trim()
    if (!trimmed) return []

    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return []
      return [parsed.origin]
    } catch {
      return []
    }
  })
}

export function normalizeCidrs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) =>
    typeof entry === 'string' && entry.trim() ? [entry.trim()] : [],
  )
}

function ipv4ToBigInt(address: string): bigint | null {
  if (isIP(address) !== 4) return null
  return address
    .split('.')
    .reduce((value, octet) => (value << 8n) | BigInt(Number(octet)), 0n)
}

function expandIpv6(address: string): string[] | null {
  const lower = address.toLowerCase()
  if (isIP(lower) !== 6) return null

  const [headText, tailText] = lower.split('::')
  const head = headText ? headText.split(':') : []
  const tail = tailText ? tailText.split(':') : []
  const missing = 8 - head.length - tail.length

  if (lower.includes('::')) {
    if (missing < 1) return null
    return [...head, ...Array.from({ length: missing }, () => '0'), ...tail]
  }

  return head.length === 8 ? head : null
}

function ipv6ToBigInt(address: string): bigint | null {
  const groups = expandIpv6(address)
  if (!groups) return null

  return groups.reduce(
    (value, group) => (value << 16n) | BigInt(Number.parseInt(group || '0', 16)),
    0n,
  )
}

function matchesCidr(ipAddress: string, cidr: string): boolean {
  const [networkText, prefixText] = cidr.split('/')
  const version = isIP(ipAddress)
  if (!version || isIP(networkText ?? '') !== version) return false

  const totalBits = version === 4 ? 32 : 128
  const prefix = prefixText === undefined ? totalBits : Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > totalBits) return false

  const ipValue = version === 4 ? ipv4ToBigInt(ipAddress) : ipv6ToBigInt(ipAddress)
  const networkValue =
    version === 4 ? ipv4ToBigInt(networkText) : ipv6ToBigInt(networkText)
  if (ipValue === null || networkValue === null) return false

  const shift = BigInt(totalBits - prefix)
  return shift === BigInt(totalBits)
    ? true
    : ipValue >> shift === networkValue >> shift
}


export function isValidCidr(cidr: string) {
  const [networkText, prefixText] = cidr.trim().split('/')
  const version = isIP(networkText ?? '')
  if (!version) return false
  const totalBits = version === 4 ? 32 : 128
  if (prefixText === undefined) return true
  const prefix = Number(prefixText)
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= totalBits
}

export function isIpAllowed(ipAddress: string | null, cidrs: string[]) {
  if (cidrs.length === 0) return true
  if (!ipAddress) return false
  return cidrs.some((cidr) => matchesCidr(ipAddress, cidr))
}

export function isOriginAllowed(
  originHeader: string | null,
  requestOrigin: string,
  allowedOrigins: string[],
) {
  if (!originHeader || allowedOrigins.length === 0) return true

  let normalizedOrigin = ''
  try {
    normalizedOrigin = new URL(originHeader).origin
  } catch {
    return false
  }

  return (
    normalizedOrigin === requestOrigin || allowedOrigins.includes(normalizedOrigin)
  )
}

export function isWriteMethod(method: string) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

export function isFirstPartyBrowserRequest(
  originHeader: string | null,
  requestOrigin: string,
) {
  if (!originHeader) return false
  try {
    return new URL(originHeader).origin === requestOrigin
  } catch {
    return false
  }
}
