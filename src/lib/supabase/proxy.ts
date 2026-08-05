import { createHash, randomUUID } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  await supabase.auth.getClaims()
  const { data: { user } } = await supabase.auth.getUser()
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null
  const userAgent = request.headers.get('user-agent') ?? 'Unknown browser'

  if (user) {
    const fingerprint = createHash('sha256').update(`${user.id}:${userAgent}:${ipAddress ?? ''}`).digest('hex')
    const { data: revoked } = await supabase.from('user_sessions').select('id').eq('user_id', user.id).eq('session_fingerprint', fingerprint).not('revoked_at', 'is', null).maybeSingle()
    if (revoked && request.nextUrl.pathname.startsWith('/dashboard')) {
      await supabase.auth.signOut({ scope: 'local' })
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('reason', 'session_revoked')
      return NextResponse.redirect(loginUrl)
    }
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const bucket = `api:${ipAddress ?? 'unknown'}:${request.nextUrl.pathname}`
    const { data: allowed } = await supabase.rpc('consume_rate_limit', { p_bucket_key: bucket, p_limit: 300, p_window_seconds: 60 })
    const blockedReason = allowed === false ? 'rate_limit' : null
    await supabase.rpc('record_api_request_event', { p_request_id: requestId, p_method: request.method, p_path: request.nextUrl.pathname, p_ip_address: ipAddress, p_user_agent: userAgent, p_blocked_reason: blockedReason })
    if (allowed === false) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'retry-after': '60', 'x-request-id': requestId } })
  }

  const securityHeaders: Record<string,string> = {
    'x-request-id': requestId,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(self), geolocation=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paymongo.com https://api.twilio.com https://api.telnyx.com; media-src 'self' blob: https:; form-action 'self' https://checkout.paymongo.com; upgrade-insecure-requests",
  }
  Object.entries(securityHeaders).forEach(([key,value]) => response.headers.set(key,value))
  return response
}
