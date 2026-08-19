import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth'
import { isValidCidr } from '@/lib/security/api-policy'
import { createClient } from '@/lib/supabase/server'

type SecurityPolicyBody = {
  mfaEnforcement?: string
  gracePeriodHours?: number
  requestsPerMinute?: number
  requireIdempotency?: boolean
  blockAnonymous?: boolean
  allowedOrigins?: unknown
  allowedIpCidrs?: unknown
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value.flatMap((item) => {
        if (typeof item !== 'string') return []
        const trimmed = item.trim()
        return trimmed && trimmed.length <= maxLength ? [trimmed] : []
      }),
    ),
  ).slice(0, maxItems)
}

function validateOrigins(values: string[]) {
  return values.every((value) => {
    try {
      const url = new URL(value)
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.origin === value.replace(/\/$/, '')
      )
    } catch {
      return false
    }
  })
}

export async function PUT(request: NextRequest) {
  const membership = await requireAdmin()
  const body = (await request.json()) as SecurityPolicyBody
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const enforcement = ['optional', 'admins', 'all'].includes(
    body.mfaEnforcement ?? '',
  )
    ? body.mfaEnforcement
    : 'optional'

  const allowedOrigins = stringArray(body.allowedOrigins, 50, 512).map((value) =>
    value.replace(/\/$/, ''),
  )
  const allowedIpCidrs = stringArray(body.allowedIpCidrs, 50, 128)

  if (!validateOrigins(allowedOrigins)) {
    return NextResponse.json(
      { error: 'Allowed origins must be complete HTTP or HTTPS origins.' },
      { status: 400 },
    )
  }

  if (!allowedIpCidrs.every((value) => isValidCidr(value))) {
    return NextResponse.json(
      { error: 'Allowed IP entries must be valid IP addresses or CIDR ranges.' },
      { status: 400 },
    )
  }

  const gracePeriodHours = Math.max(
    0,
    Math.min(168, Number(body.gracePeriodHours ?? 24)),
  )
  const { data: currentMfaPolicy } = await supabase
    .from('organization_mfa_policies')
    .select('enforcement, grace_period_hours, updated_at')
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  const now = new Date().toISOString()
  const mfaPolicyChanged =
    currentMfaPolicy?.enforcement !== enforcement ||
    Number(currentMfaPolicy?.grace_period_hours ?? -1) !== gracePeriodHours
  const mfaUpdatedAt = mfaPolicyChanged
    ? now
    : currentMfaPolicy?.updated_at ?? now

  const [mfa, api] = await Promise.all([
    supabase.from('organization_mfa_policies').upsert(
      {
        organization_id: membership.organization_id,
        enforcement,
        grace_period_hours: gracePeriodHours,
        updated_by: user?.id ?? null,
        updated_at: mfaUpdatedAt,
      },
      { onConflict: 'organization_id' },
    ),
    supabase.from('api_security_policies').upsert(
      {
        organization_id: membership.organization_id,
        requests_per_minute: Math.max(
          10,
          Math.min(10000, Number(body.requestsPerMinute ?? 120)),
        ),
        require_idempotency_for_writes: body.requireIdempotency !== false,
        block_anonymous_api: body.blockAnonymous !== false,
        allowed_origins: allowedOrigins,
        allowed_ip_cidrs: allowedIpCidrs,
        updated_by: user?.id ?? null,
        updated_at: now,
      },
      { onConflict: 'organization_id' },
    ),
  ])

  if (mfa.error || api.error) {
    return NextResponse.json(
      { error: mfa.error?.message ?? api.error?.message },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
