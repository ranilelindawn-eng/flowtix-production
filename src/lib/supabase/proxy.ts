import { randomUUID } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  DEFAULT_API_SECURITY_POLICY,
  isFirstPartyBrowserRequest,
  isIpAllowed,
  isOriginAllowed,
  isPublicApiPath,
  isTrustedApiPath,
  isWriteMethod,
  normalizeCidrs,
  normalizeOrigins,
  type ApiSecurityPolicy,
} from '@/lib/security/api-policy'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const PLATFORM_API_PREFIXES = ['/api/platform-admin/', '/api/production/']

function isPlatformApiPath(pathname: string) {
  return PLATFORM_API_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  )
}

function securityHeaders(requestId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'x-request-id': requestId,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(self), geolocation=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy':
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paymongo.com https://*.signalwire.com wss://*.signalwire.com; media-src 'self' blob: https:; form-action 'self' https://checkout.paymongo.com; upgrade-insecure-requests",
    'content-security-policy-report-only':
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paymongo.com https://*.signalwire.com wss://*.signalwire.com; media-src 'self' blob: https:; form-action 'self' https://checkout.paymongo.com; upgrade-insecure-requests",
  }

  if (process.env.NODE_ENV === 'production') {
    headers['strict-transport-security'] = 'max-age=31536000'
  }

  return headers
}

function applySecurityHeaders(response: NextResponse, requestId: string) {
  Object.entries(securityHeaders(requestId)).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
  extraHeaders: Record<string, string> = {},
) {
  const response = NextResponse.json(body, { status })
  Object.entries(extraHeaders).forEach(([key, value]) => response.headers.set(key, value))
  return applySecurityHeaders(response, requestId)
}

type Membership = {
  organizationId: string
  role: string
}

function parseMembership(value: unknown): Membership | null {
  const row = Array.isArray(value) ? value[0] ?? null : value
  if (!row || typeof row !== 'object') return null

  const organizationId =
    'organization_id' in row && typeof row.organization_id === 'string'
      ? row.organization_id
      : ''
  const role = 'role' in row && typeof row.role === 'string' ? row.role : ''

  return organizationId && role ? { organizationId, role } : null
}

function parseApiPolicy(value: unknown): ApiSecurityPolicy {
  if (!value || typeof value !== 'object') return DEFAULT_API_SECURITY_POLICY

  const row = value as Record<string, unknown>
  const requestedLimit = Number(row.requests_per_minute)

  return {
    requestsPerMinute:
      Number.isFinite(requestedLimit) && requestedLimit >= 10 && requestedLimit <= 10000
        ? Math.floor(requestedLimit)
        : DEFAULT_API_SECURITY_POLICY.requestsPerMinute,
    requireIdempotencyForWrites: row.require_idempotency_for_writes !== false,
    blockAnonymousApi: row.block_anonymous_api !== false,
    allowedOrigins: normalizeOrigins(row.allowed_origins),
    allowedIpCidrs: normalizeCidrs(row.allowed_ip_cidrs),
  }
}

export async function updateSession(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = !claimsError ? claimsData?.claims : null
  const authSessionId = typeof claims?.session_id === 'string' ? claims.session_id : null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  const userAgent = request.headers.get('user-agent') ?? 'Unknown browser'
  const pathname = request.nextUrl.pathname

  if (user && authSessionId) {
    const { data: revoked } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('auth_session_id', authSessionId)
      .not('revoked_at', 'is', null)
      .maybeSingle()

    if (revoked) {
      if (pathname.startsWith('/api/')) {
        return jsonResponse({ error: 'Session revoked.' }, 401, requestId)
      }

      if (pathname.startsWith('/dashboard') || pathname.startsWith('/platform')) {
        await supabase.auth.signOut({ scope: 'local' })
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.searchParams.set('reason', 'session_revoked')
        return applySecurityHeaders(NextResponse.redirect(loginUrl), requestId)
      }
    }
  }

  let membership: Membership | null = null
  if (user) {
    const { data: membershipData, error: membershipError } = await supabase.rpc(
      'get_current_organization_membership',
    )
    if (!membershipError) membership = parseMembership(membershipData)
  }

  if (user && membership && pathname.startsWith('/dashboard')) {
    const { data: mfaPolicy, error: mfaPolicyError } = await supabase
      .from('organization_mfa_policies')
      .select('enforcement, grace_period_hours, updated_at')
      .eq('organization_id', membership.organizationId)
      .maybeSingle()

    if (!mfaPolicyError) {
      const enforcement = mfaPolicy?.enforcement ?? 'optional'
      const mfaRequired =
        enforcement === 'all' ||
        (enforcement === 'admins' && ['owner', 'admin'].includes(membership.role))
      const graceHours = Math.max(0, Number(mfaPolicy?.grace_period_hours ?? 0))
      const policyUpdatedAt = Date.parse(mfaPolicy?.updated_at ?? '')
      const graceDeadline = Number.isFinite(policyUpdatedAt)
        ? policyUpdatedAt + graceHours * 60 * 60 * 1000
        : 0
      const enforcementActive = graceHours === 0 || Date.now() >= graceDeadline
      const aal = typeof claims?.aal === 'string' ? claims.aal : 'aal1'

      if (mfaRequired && enforcementActive && aal !== 'aal2') {
        const mfaUrl = request.nextUrl.clone()
        mfaUrl.pathname = '/mfa'
        mfaUrl.search = ''
        mfaUrl.searchParams.set(
          'next',
          `${request.nextUrl.pathname}${request.nextUrl.search}`,
        )
        return applySecurityHeaders(NextResponse.redirect(mfaUrl), requestId)
      }
    }
  }

  if (
    user &&
    membership &&
    pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/dashboard/billing')
  ) {
    const { data: entitlementData, error: entitlementError } = await supabase.rpc(
      'organization_entitlements',
      { target_org: membership.organizationId },
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
        return applySecurityHeaders(NextResponse.redirect(billingUrl), requestId)
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
        ([path]) => pathname === path || pathname.startsWith(`${path}/`),
      )?.[1]

      if (requiredFeature && !entitlements.includes(requiredFeature)) {
        const upgradeUrl = request.nextUrl.clone()
        upgradeUrl.pathname = '/dashboard/upgrade'
        upgradeUrl.search = ''
        upgradeUrl.searchParams.set('feature', requiredFeature)
        return applySecurityHeaders(NextResponse.redirect(upgradeUrl), requestId)
      }
    }
  }

  if (pathname.startsWith('/api/')) {
    let trustedSupabase: ReturnType<typeof createServiceRoleClient>

    try {
      trustedSupabase = createServiceRoleClient()
    } catch (error) {
      console.error('Unable to initialize trusted API security client.', error)
      return jsonResponse(
        { error: 'Request security check unavailable.' },
        503,
        requestId,
        { 'retry-after': '5' },
      )
    }

    const trustedPath = isTrustedApiPath(pathname) || isPlatformApiPath(pathname)
    const publicPath = isPublicApiPath(pathname)
    const requestedOrganizationId =
      request.headers.get('x-flowtix-organization-id')?.trim() ?? ''
    const anonymousOrganizationId =
      !user && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestedOrganizationId,
      )
        ? requestedOrganizationId
        : null
    const policyOrganizationId = membership?.organizationId ?? anonymousOrganizationId
    let policy = DEFAULT_API_SECURITY_POLICY

    if (policyOrganizationId && !trustedPath && !publicPath) {
      const { data: policyRow, error: policyError } = await trustedSupabase
        .from('api_security_policies')
        .select(
          'requests_per_minute, require_idempotency_for_writes, block_anonymous_api, allowed_origins, allowed_ip_cidrs',
        )
        .eq('organization_id', policyOrganizationId)
        .maybeSingle()

      if (policyError) {
        console.error('Unable to load organization API security policy.', {
          requestId,
          organizationId: policyOrganizationId,
          message: policyError.message,
        })
        return jsonResponse(
          { error: 'Request security check unavailable.' },
          503,
          requestId,
          { 'retry-after': '5' },
        )
      }

      policy = parseApiPolicy(policyRow)
    }

    let blockedReason: string | null = null
    let blockedStatus = 403
    let blockedMessage = 'Request blocked by organization security policy.'

    if (!trustedPath && !publicPath) {
      if (!user && (!policyOrganizationId || policy.blockAnonymousApi)) {
        blockedReason = 'anonymous_api'
        blockedStatus = 401
        blockedMessage = 'Authentication required.'
      } else if (policyOrganizationId && !isIpAllowed(ipAddress, policy.allowedIpCidrs)) {
        blockedReason = 'ip_not_allowed'
      } else if (
        policyOrganizationId &&
        !isOriginAllowed(
          request.headers.get('origin'),
          request.nextUrl.origin,
          policy.allowedOrigins,
        )
      ) {
        blockedReason = 'origin_not_allowed'
      } else if (
        policyOrganizationId &&
        policy.requireIdempotencyForWrites &&
        isWriteMethod(request.method) &&
        !isFirstPartyBrowserRequest(
          request.headers.get('origin'),
          request.nextUrl.origin,
        ) &&
        !request.headers.get('idempotency-key')?.trim()
      ) {
        blockedReason = 'idempotency_required'
        blockedStatus = 400
        blockedMessage = 'Idempotency-Key is required for external write requests.'
      }
    }

    const bucketScope = policyOrganizationId ?? (trustedPath ? 'trusted' : 'public')
    const bucket = `api:${bucketScope}:${user?.id ?? ipAddress ?? 'anonymous'}`
    const rateLimit = trustedPath || publicPath ? 600 : policy.requestsPerMinute
    const { data: allowed, error: rateLimitError } = await trustedSupabase.rpc(
      'consume_rate_limit',
      {
        p_bucket_key: bucket,
        p_limit: rateLimit,
        p_window_seconds: 60,
      },
    )

    if (rateLimitError) {
      console.error('Trusted API rate-limit check failed.', {
        requestId,
        path: pathname,
        message: rateLimitError.message,
      })
      return jsonResponse(
        { error: 'Request security check unavailable.' },
        503,
        requestId,
        { 'retry-after': '5' },
      )
    }

    if (allowed === false && !blockedReason) {
      blockedReason = 'rate_limit'
      blockedStatus = 429
      blockedMessage = 'Too many requests.'
    }

    const { error: telemetryError } = await trustedSupabase.rpc(
      'record_api_request_event',
      {
        p_request_id: requestId,
        p_method: request.method,
        p_path: pathname,
        p_user_id: user?.id ?? null,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_blocked_reason: blockedReason,
      },
    )

    if (telemetryError) {
      console.error('Trusted API telemetry write failed.', {
        requestId,
        path: pathname,
        message: telemetryError.message,
      })
    }

    if (blockedReason) {
      return jsonResponse(
        { error: blockedMessage },
        blockedStatus,
        requestId,
        blockedStatus === 429 ? { 'retry-after': '60' } : {},
      )
    }
  }

  return applySecurityHeaders(response, requestId)
}
