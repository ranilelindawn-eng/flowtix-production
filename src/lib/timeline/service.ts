import { createClient } from '@/lib/supabase/server'
import type { TimelineEvent, TimelineFilters } from './types'

export async function getTimelineEvents(
  filters: TimelineFilters,
): Promise<TimelineEvent[]> {
  const supabase = await createClient()

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 250)

  let query = supabase
    .from('crm_timeline_events')
    .select('*')
    .eq('organization_id', filters.organizationId)
    // Only show real CRM timeline sources
    .in('source_table', [
      'communication_messages',
      'contacts',
      'contact_notes',
      'contact_tasks',
      'crm_activities',
      'calendar_events',
      'opportunities',
      'calls',
    ])
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (filters.contactId) {
    query = query.eq('contact_id', filters.contactId)
  }

  if (filters.companyId) {
    query = query.eq('company_id', filters.companyId)
  }

  if (filters.opportunityId) {
    query = query.eq('opportunity_id', filters.opportunityId)
  }

  if (filters.eventType) {
    query = query.eq('event_type', filters.eventType)
  }

  if (filters.action) {
    query = query.eq('event_action', filters.action)
  }

  if (filters.before) {
    query = query.lt('occurred_at', filters.before)
  }

  if (filters.search) {
    const safeSearch = filters.search.replaceAll(',', '').trim()

    if (safeSearch) {
      query = query.or(
        `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`,
      )
    }
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as TimelineEvent[]
}