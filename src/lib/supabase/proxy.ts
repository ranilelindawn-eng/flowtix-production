import { randomUUID } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const authSessionId =
    !claimsError && typeof claimsData?.claims?.session_id === 'string'
      ? claimsData.claims.session_id
      : null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  const userAgent = request.headers.get('user-agent') ?? 'Unknown browser'

  if (user && authSessionId) {
    const { data: revoked } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('auth_session_id', authSessionId)
      .not('revoked_at', 'is', null)
      .maybeSingle()

    if (revoked) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Session revoked.' },
          {
            status: 401,
            headers: {
              'x-request-id': requestId,
            },
          },
        )
      }

      if (
        request.nextUrl.pathname.startsWith('/dashboard') ||
        request.nextUrl.pathname.startsWith('/platform')
      ) {
        await supabase.auth.signOut({ scope: 'local' })
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.searchParams.set('reason', 'session_revoked')
        return NextResponse.redirect(loginUrl)
      }
    }
  }

  if (
    user &&
    request.nextUrl.pathname.startsWith('/dashboard') &&
    !request.nextUrl.pathname.startsWith('/dashboard/billing')
  ) {
    const { data: membershipData, error: membershipError } = await supabase.rpc(
      'get_current_organization_membership',
    )

    if (!membershipError) {
      const membership = Array.isArray(membershipData)
        ? membershipData[0] ?? null
        : membershipData
      const organizationId =
        membership &&
        typeof membership === 'object' &&
        'organization_id' in membership &&
        typeof membership.organization_id === 'string'
          ? membership.organization_id
          : null

      if (organizationId) {
        const { data: entitlementData, error: entitlementError } = await supabase.rpc(
          'organization_entitlements',
          { target_org: organizationId },
        )

        if (!entitlementError) {
          const entitlementRow = Array.isArray(entitlementData)
            ? entitlementData[0] ?? null
            : entitlementData
          const subscriptionStatus =
            entitlementRow &&
            typeof entitlementRow === 'object' &&
            'subscription_status' in entitlementRow &&
            typeof entitlementRow.subscription_status === 'string'
              ? entitlementRow.subscription_status
              : 'inactive'
          const entitlements =
            entitlementRow &&
            typeof entitlementRow === 'object' &&
            'entitlements' in entitlementRow &&
            Array.isArray(entitlementRow.entitlements)
              ? entitlementRow.entitlements.filter(
                  (value: unknown): value is string => typeof value === 'string',
                )
              : []

          const subscriptionAllowsAccess =
            subscriptionStatus === 'active' ||
            subscriptionStatus === 'trialing' ||
            (subscriptionStatus === 'past_due' && entitlements.length > 0)

          if (!subscriptionAllowsAccess) {
            const billingUrl = request.nextUrl.clone()
            billingUrl.pathname = '/dashboard/billing'
            billingUrl.searchParams.set('access', 'subscription_required')
            return NextResponse.redirect(billingUrl)
          }

          const featureByPath: Array<[string, string]> = [
            ['/dashboard/sequences', 'automation.sequences'],
            ['/dashboard/dialer', 'dialer.cloud'],
            ['/dashboard/live-calls', 'dialer.cloud'],
            ['/dashboard/telephony-monitoring', 'dialer.cloud'],
            ['/dashboard/recordings', 'dialer.cloud'],
            ['/dashboard/transcripts', 'ai.transcription'],
            ['/dashboard/dashboards', 'analytics.dashboards'],
            ['/dashboard/kpis', 'analytics.kpi'],
            ['/dashboard/sales-analytics', 'analytics.sales'],
            ['/dashboard/call-analytics', 'analytics.calls'],
            ['/dashboard/agent-analytics', 'analytics.agents'],
            ['/dashboard/campaign-analytics', 'analytics.campaigns'],
            ['/dashboard/ai-analytics', 'analytics.ai'],
            ['/dashboard/ai', 'ai.chat'],
            ['/dashboard/insights', 'ai.insights'],
            ['/dashboard/summaries', 'ai.call_analysis'],
            ['/dashboard/attendance', 'workforce.attendance'],
            ['/dashboard/roles', 'team.advanced'],
            ['/dashboard/exports', 'reports.export'],
          ]

          const requiredFeature = featureByPath.find(
            ([path]) =>
              request.nextUrl.pathname === path ||
              request.nextUrl.pathname.startsWith(`${path}/`),
          )?.[1]

          if (requiredFeature && !entitlements.includes(requiredFeature)) {
            const upgradeUrl = request.nextUrl.clone()
            upgradeUrl.pathname = '/dashboard/upgrade'
            upgradeUrl.search = ''
            upgradeUrl.searchParams.set('feature', requiredFeature)
            return NextResponse.redirect(upgradeUrl)
          }
        }
      }
    }
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    let trustedSupabase: ReturnType<typeof createServiceRoleClient>

    try {
      trustedSupabase = createServiceRoleClient()
    } catch (error) {
      console.error('Unable to initialize trusted API security client.', error)
      return NextResponse.json(
        { error: 'Request security check unavailable.' },
        {
          status: 503,
          headers: {
            'retry-after': '5',
            'x-request-id': requestId,
          },
        },
      )
    }

    const bucket = `api:${ipAddress ?? 'unknown'}:${request.nextUrl.pathname}`
    const { data: allowed, error: rateLimitError } = await trustedSupabase.rpc(
      'consume_rate_limit',
      {
        p_bucket_key: bucket,
        p_limit: 300,
        p_window_seconds: 60,
      },
    )

    if (rateLimitError) {
      console.error('Trusted API rate-limit check failed.', {
        requestId,
        path: request.nextUrl.pathname,
        message: rateLimitError.message,
      })
      return NextResponse.json(
        { error: 'Request security check unavailable.' },
        {
          status: 503,
          headers: {
            'retry-after': '5',
            'x-request-id': requestId,
          },
        },
      )
    }

    const blockedReason = allowed === false ? 'rate_limit' : null
    const { error: telemetryError } = await trustedSupabase.rpc(
      'record_api_request_event',
      {
        p_request_id: requestId,
        p_method: request.method,
        p_path: request.nextUrl.pathname,
        p_user_id: user?.id ?? null,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_blocked_reason: blockedReason,
      },
    )

    if (telemetryError) {
      console.error('Trusted API telemetry write failed.', {
        requestId,
        path: request.nextUrl.pathname,
        message: telemetryError.message,
      })
    }

    if (allowed === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        {
          status: 429,
          headers: {
            'retry-after': '60',
            'x-request-id': requestId,
          },
        },
      )
    }
  }

  const securityHeaders: Record<string, string> = {
    'x-request-id': requestId,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(self), geolocation=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy':
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paymongo.com https://*.signalwire.com wss://*.signalwire.com; media-src 'self' blob: https:; form-action 'self' https://checkout.paymongo.com; upgrade-insecure-requests",
  }
  Object.entries(securityHeaders).forEach(([key, value]) => response.headers.set(key, value))
  return response
}
