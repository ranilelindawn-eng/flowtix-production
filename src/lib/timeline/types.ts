export type TimelineEventType =
  | 'call'
  | 'note'
  | 'task'
  | 'activity'
  | 'calendar'
  | 'opportunity'
  | 'system'
  | 'other'

export type TimelineEvent = {
  id: string
  organization_id: string
  contact_id: string | null
  company_id: string | null
  opportunity_id: string | null
  event_type: TimelineEventType
  event_action: string
  source_table: string
  source_id: string
  title: string
  description: string | null
  occurred_at: string
  actor_user_id: string | null
  owner_membership_id: string | null
  visibility: 'private' | 'team' | 'organization'
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
}

export type TimelineFilters = {
  organizationId: string
  contactId?: string
  companyId?: string
  opportunityId?: string
  eventType?: string
  action?: string
  search?: string
  before?: string
  limit?: number
}
