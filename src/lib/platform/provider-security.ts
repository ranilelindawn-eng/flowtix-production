import 'server-only'

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bBasic\s+[A-Za-z0-9+/=]+/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /(["']?(?:api[_-]?key|token|secret|password|authorization|credential)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
  /([?&](?:api[_-]?key|token|secret|password|authorization|credential)=)[^&\s]+/gi,
]

export function sanitizeProviderMessage(
  value: unknown,
  fallback = 'Provider request failed.',
): string {
  const raw =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : fallback

  let sanitized = raw.trim() || fallback

  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, prefix?: string) =>
      prefix ? `${prefix}[REDACTED]` : '[REDACTED]',
    )
  }

  sanitized = sanitized
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized.slice(0, 1000) || fallback
}
