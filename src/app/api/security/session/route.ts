import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestHeaders = await headers()
  const userAgent = requestHeaders.get('user-agent') ?? 'Unknown browser'
  const ipAddress = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const fingerprint = createHash('sha256')
    .update(`${user.id}:${userAgent}:${ipAddress ?? ''}`)
    .digest('hex')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('Unable to resolve the session organization.', profileError)
    return NextResponse.json(
      { error: 'Unable to resolve the session organization.' },
      { status: 500 },
    )
  }

  const deviceName = /mobile/i.test(userAgent)
    ? 'Mobile device'
    : /windows/i.test(userAgent)
      ? 'Windows device'
      : /mac/i.test(userAgent)
        ? 'Mac device'
        : 'Web browser'

  const { error } = await supabase
    .from('user_sessions')
    .upsert(
      {
        user_id: user.id,
        organization_id: profile?.organization_id ?? null,
        session_fingerprint: fingerprint,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_name: deviceName,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_fingerprint' },
    )

  if (error) {
    console.error('Unable to record the authenticated session.', error)
    return NextResponse.json(
      { error: 'Unable to record the authenticated session.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
