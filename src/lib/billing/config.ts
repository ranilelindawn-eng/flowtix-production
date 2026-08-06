import 'server-only'

const LOCAL_APP_URL = 'http://localhost:3000'

function normalizeAbsoluteUrl(value: string): URL {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Flowtix application URL must use HTTP or HTTPS.')
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed
}

export function getBillingAppUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_APP_URL is required in production.')
    }
    return LOCAL_APP_URL
  }

  const parsed = normalizeAbsoluteUrl(configured)
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS in production.')
  }

  return parsed.toString().replace(/\/$/, '')
}

export function expectedPayMongoMode(): 'live' | 'test' | null {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim() ?? ''
  if (key.startsWith('sk_live_')) return 'live'
  if (key.startsWith('sk_test_')) return 'test'
  return null
}
