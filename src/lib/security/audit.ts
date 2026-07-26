import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function writeAuditLog(action: string, resourceType?: string, resourceId?: string, metadata: Record<string, unknown> = {}) {
  const headerStore = await headers()
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = headerStore.get('user-agent') ?? null
  const supabase = await createClient()
  const { error } = await supabase.rpc('log_audit_event', {
    p_action: action,
    p_resource_type: resourceType ?? null,
    p_resource_id: resourceId ?? null,
    p_metadata: metadata,
    p_ip_address: ip,
    p_user_agent: userAgent,
  })
  if (error) console.error('Audit logging failed:', error.message)
}
