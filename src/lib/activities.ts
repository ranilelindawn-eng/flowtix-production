import { createClient } from '@/lib/supabase/server'

export type ActivityType = 'call' | 'email' | 'sms' | 'meeting' | 'note' | 'task' | 'status_change' | 'web' | 'social' | 'other'
export type ActivityDirection = 'inbound' | 'outbound' | 'internal'
export type ActivityStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'failed'

export type CrmActivity = {
  id: string
  organization_id: string
  contact_id: string | null
  company_id: string | null
  opportunity_id: string | null
  activity_type: ActivityType
  direction: ActivityDirection
  status: ActivityStatus
  subject: string
  body: string | null
  outcome: string | null
  occurred_at: string
  duration_seconds: number | null
  source: string
  visibility: 'private' | 'team' | 'organization'
  owner_membership_id: string | null
  created_by: string
  metadata: Record<string, unknown>
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function getActivityById(input: { organizationId: string; activityId: string }): Promise<CrmActivity | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_activities')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('id', input.activityId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as CrmActivity | null) ?? null
}

export async function getActivities(input: { organizationId: string; contactId?: string; type?: string; status?: string; search?: string; limit?: number }): Promise<CrmActivity[]> {
  const supabase = await createClient()
  let query = supabase.from('crm_activities').select('*').eq('organization_id', input.organizationId).order('occurred_at', { ascending: false }).limit(Math.min(input.limit ?? 100, 250))
  if (input.contactId) query = query.eq('contact_id', input.contactId)
  if (input.type) query = query.eq('activity_type', input.type)
  if (input.status) query = query.eq('status', input.status)
  if (input.search) query = query.or(`subject.ilike.%${input.search.replaceAll(',', '')}%,body.ilike.%${input.search.replaceAll(',', '')}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as CrmActivity[]
}
