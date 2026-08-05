import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type SecurityOverview = {
  sessions: Record<string, unknown>[]
  devices: Record<string, unknown>[]
  threats: Record<string, unknown>[]
  snapshots: Record<string, unknown>[]
  apiPolicy: Record<string, unknown> | null
  mfaPolicy: Record<string, unknown> | null
  secrets: Record<string, unknown>[]
}

export async function getRequestIdentity(userId: string) {
  const h = await headers()
  const userAgent = h.get('user-agent') ?? 'Unknown browser'
  const ipAddress = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const fingerprint = createHash('sha256').update(`${userId}:${userAgent}:${ipAddress ?? ''}`).digest('hex')
  const deviceName = /mobile/i.test(userAgent) ? 'Mobile device' : /windows/i.test(userAgent) ? 'Windows device' : /mac/i.test(userAgent) ? 'Mac device' : 'Web browser'
  const platform = /windows/i.test(userAgent) ? 'Windows' : /mac/i.test(userAgent) ? 'macOS' : /linux/i.test(userAgent) ? 'Linux' : /android/i.test(userAgent) ? 'Android' : /iphone|ipad/i.test(userAgent) ? 'iOS' : 'Unknown'
  const browser = /edg/i.test(userAgent) ? 'Edge' : /chrome/i.test(userAgent) ? 'Chrome' : /firefox/i.test(userAgent) ? 'Firefox' : /safari/i.test(userAgent) ? 'Safari' : 'Unknown'
  return { userAgent, ipAddress, fingerprint, deviceName, platform, browser }
}

export async function getSecurityOverview(): Promise<SecurityOverview> {
  const membership = await requirePermission('audit_logs.view')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const organizationId = membership.organization_id
  const [sessions,devices,threats,snapshots,apiPolicy,mfaPolicy,secrets] = await Promise.all([
    supabase.from('user_sessions').select('*').eq('user_id',user.id).order('last_seen_at',{ascending:false}).limit(50),
    supabase.from('user_devices').select('id,device_name,device_type,platform,browser,last_ip,first_seen_at,last_seen_at,trusted_at,revoked_at').eq('user_id',user.id).order('last_seen_at',{ascending:false}).limit(50),
    supabase.from('security_threat_events').select('*').eq('organization_id',organizationId).order('detected_at',{ascending:false}).limit(100),
    supabase.from('security_monitoring_snapshots').select('*').eq('organization_id',organizationId).order('captured_at',{ascending:false}).limit(30),
    supabase.from('api_security_policies').select('*').eq('organization_id',organizationId).maybeSingle(),
    supabase.from('organization_mfa_policies').select('*').eq('organization_id',organizationId).maybeSingle(),
    supabase.rpc('list_organization_secret_metadata',{p_organization_id:organizationId}),
  ])
  for (const result of [sessions,devices,threats,snapshots,apiPolicy,mfaPolicy,secrets]) if (result.error) throw new Error(result.error.message)
  return {sessions:sessions.data??[],devices:devices.data??[],threats:threats.data??[],snapshots:snapshots.data??[],apiPolicy:apiPolicy.data??null,mfaPolicy:mfaPolicy.data??null,secrets:secrets.data??[]}
}
