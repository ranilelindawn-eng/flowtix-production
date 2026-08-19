import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'

import { getRequestIdentity } from '@/lib/security/platform'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function POST() {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const authSessionId =
    !claimsError && typeof claimsData?.claims?.session_id === 'string'
      ? claimsData.claims.session_id
      : null
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !authSessionId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const identity = await getRequestIdentity(user.id)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json(
      { error: 'Unable to resolve session organization.' },
      { status: 500 },
    )
  }

  let trustedSupabase: ReturnType<typeof createServiceRoleClient>

  try {
    trustedSupabase = createServiceRoleClient()
  } catch (error) {
    console.error('Unable to initialize trusted session tracking client.', error)
    return NextResponse.json(
      { error: 'Unable to record authenticated session.' },
      { status: 500 },
    )
  }

  const now = new Date().toISOString()
  const organizationId = profile?.organization_id ?? null

  const { error: deviceError } = await trustedSupabase
    .from('user_devices')
    .upsert(
      {
        user_id: user.id,
        organization_id: organizationId,
        device_fingerprint: identity.fingerprint,
        device_name: identity.deviceName,
        device_type: 'browser',
        platform: identity.platform,
        browser: identity.browser,
        first_ip: identity.ipAddress,
        last_ip: identity.ipAddress,
        last_seen_at: now,
      },
      { onConflict: 'user_id,device_fingerprint' },
    )

  if (deviceError) {
    console.error('Trusted device tracking write failed.', {
      userId: user.id,
      message: deviceError.message,
    })
    return NextResponse.json({ error: 'Unable to record device.' }, { status: 500 })
  }

  const sessionFingerprint = createHash('sha256')
    .update(`${user.id}:${authSessionId}`)
    .digest('hex')

  const { error: sessionError } = await trustedSupabase
    .from('user_sessions')
    .upsert(
      {
        user_id: user.id,
        organization_id: organizationId,
        auth_session_id: authSessionId,
        session_fingerprint: sessionFingerprint,
        device_fingerprint: identity.fingerprint,
        ip_address: identity.ipAddress,
        user_agent: identity.userAgent,
        device_name: identity.deviceName,
        last_seen_at: now,
        last_authenticated_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          platform: identity.platform,
          browser: identity.browser,
        },
      },
      { onConflict: 'user_id,auth_session_id' },
    )

  if (sessionError) {
    console.error('Trusted session tracking write failed.', {
      userId: user.id,
      message: sessionError.message,
    })
    return NextResponse.json(
      { error: 'Unable to record authenticated session.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, fingerprint: sessionFingerprint })
}
