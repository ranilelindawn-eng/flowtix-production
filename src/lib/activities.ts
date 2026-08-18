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

export type ActivityFeedSource = 'manual' | 'call' | 'calendar' | 'opportunity'

export type ActivityFeedItem = {
  id: string
  sourceId: string
  sourceKind: ActivityFeedSource
  sourceLabel: string
  href: string
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
  visibility: 'private' | 'team' | 'organization'
  owner_membership_id: string | null
  created_by: string | null
}

type FeedInput = {
  organizationId: string
  type?: string
  status?: string
  search?: string
  limit?: number
  viewerUserId: string
  viewerMembershipId: string
  canViewAllCalls: boolean
  canViewAllCalendar: boolean
  canViewAllOpportunities: boolean
}

type CompletedCallRow = {
  id: string
  organization_id: string
  contact_id: string | null
  direction: string
  status: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  notes: string | null
  owner_membership_id: string | null
  created_by: string
}

type CalendarEventRow = {
  id: string
  organization_id: string
  contact_id: string | null
  company_id: string | null
  opportunity_id: string | null
  event_type: string
  status: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  owner_membership_id: string | null
  created_by: string
}

type StageHistoryRow = {
  id: string
  organization_id: string
  opportunity_id: string
  pipeline_id: string
  from_stage_id: string | null
  to_stage_id: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  changed_at: string
}

type OpportunityRow = {
  id: string
  organization_id: string
  pipeline_id: string
  contact_id: string | null
  company_id: string | null
  name: string
  owner_membership_id: string | null
  created_by: string
}

type StageRow = {
  id: string
  name: string
}

function normalizeSearch(value: string | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function matchesFeedFilters(item: ActivityFeedItem, input: FeedInput) {
  if (input.type && item.activity_type !== input.type) return false
  if (input.status && item.status !== input.status) return false

  const search = normalizeSearch(input.search)
  if (!search) return true

  return [item.subject, item.body, item.outcome, item.sourceLabel]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(search))
}

function calculateDurationSeconds(start: string, end: string | null) {
  if (!end) return null
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null
  return Math.round((endMs - startMs) / 1000)
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

export async function getActivityFeed(input: FeedInput): Promise<ActivityFeedItem[]> {
  const supabase = await createClient()
  const sourceLimit = Math.min(Math.max((input.limit ?? 150) * 2, 150), 300)

  async function loadManualActivities(): Promise<ActivityFeedItem[]> {
    const rows = await getActivities({
      organizationId: input.organizationId,
      limit: sourceLimit,
    })

    return rows.map((row): ActivityFeedItem => ({
      id: `manual:${row.id}`,
      sourceId: row.id,
      sourceKind: 'manual',
      sourceLabel: 'Manual activity',
      href: `/dashboard/activities/${row.id}`,
      organization_id: row.organization_id,
      contact_id: row.contact_id,
      company_id: row.company_id,
      opportunity_id: row.opportunity_id,
      activity_type: row.activity_type,
      direction: row.direction,
      status: row.status,
      subject: row.subject,
      body: row.body,
      outcome: row.outcome,
      occurred_at: row.occurred_at,
      duration_seconds: row.duration_seconds,
      visibility: row.visibility,
      owner_membership_id: row.owner_membership_id,
      created_by: row.created_by,
    }))
  }

  async function loadCompletedCalls(): Promise<ActivityFeedItem[]> {
    if (input.type && input.type !== 'call') return []
    if (input.status && input.status !== 'completed') return []

    let query = supabase
      .from('calls')
      .select('id,organization_id,contact_id,direction,status,started_at,ended_at,duration_seconds,notes,owner_membership_id,created_by')
      .eq('organization_id', input.organizationId)
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .limit(sourceLimit)

    if (!input.canViewAllCalls) {
      query = query.or(`owner_membership_id.eq.${input.viewerMembershipId},created_by.eq.${input.viewerUserId}`)
    }

    const { data, error } = await query
    if (error) throw new Error(`Unable to load completed call activities: ${error.message}`)

    return ((data ?? []) as CompletedCallRow[]).map((row): ActivityFeedItem => ({
      id: `call:${row.id}`,
      sourceId: row.id,
      sourceKind: 'call',
      sourceLabel: 'Completed call',
      href: `/dashboard/calls/${row.id}`,
      organization_id: row.organization_id,
      contact_id: row.contact_id,
      company_id: null,
      opportunity_id: null,
      activity_type: 'call',
      direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
      status: 'completed',
      subject: `${row.direction === 'inbound' ? 'Inbound' : 'Outbound'} call completed`,
      body: row.notes,
      outcome: 'Completed',
      occurred_at: row.ended_at || row.started_at,
      duration_seconds: row.duration_seconds ?? calculateDurationSeconds(row.started_at, row.ended_at),
      visibility: 'organization',
      owner_membership_id: row.owner_membership_id,
      created_by: row.created_by,
    }))
  }

  async function loadCompletedMeetings(): Promise<ActivityFeedItem[]> {
    if (input.type && input.type !== 'meeting') return []
    if (input.status && input.status !== 'completed') return []

    let query = supabase
      .from('calendar_events')
      .select('id,organization_id,contact_id,company_id,opportunity_id,event_type,status,title,description,starts_at,ends_at,owner_membership_id,created_by')
      .eq('organization_id', input.organizationId)
      .eq('status', 'completed')
      .in('event_type', ['meeting', 'demo'])
      .order('ends_at', { ascending: false })
      .limit(sourceLimit)

    if (!input.canViewAllCalendar) {
      query = query.or(`owner_membership_id.eq.${input.viewerMembershipId},created_by.eq.${input.viewerUserId}`)
    }

    const { data, error } = await query
    if (error) throw new Error(`Unable to load completed meeting activities: ${error.message}`)

    return ((data ?? []) as CalendarEventRow[]).map((row): ActivityFeedItem => ({
      id: `calendar:${row.id}`,
      sourceId: row.id,
      sourceKind: 'calendar',
      sourceLabel: row.event_type === 'demo' ? 'Completed demo' : 'Completed meeting',
      href: '/dashboard/calendar',
      organization_id: row.organization_id,
      contact_id: row.contact_id,
      company_id: row.company_id,
      opportunity_id: row.opportunity_id,
      activity_type: 'meeting',
      direction: 'internal',
      status: 'completed',
      subject: `${row.title} · ${row.event_type === 'demo' ? 'demo completed' : 'meeting completed'}`,
      body: row.description,
      outcome: 'Completed',
      occurred_at: row.ends_at,
      duration_seconds: calculateDurationSeconds(row.starts_at, row.ends_at),
      visibility: 'organization',
      owner_membership_id: row.owner_membership_id,
      created_by: row.created_by,
    }))
  }

  async function loadOpportunityChanges(): Promise<ActivityFeedItem[]> {
    if (input.type && input.type !== 'status_change') return []
    if (input.status && input.status !== 'completed') return []

    const { data: historyData, error: historyError } = await supabase
      .from('opportunity_stage_history')
      .select('id,organization_id,opportunity_id,pipeline_id,from_stage_id,to_stage_id,from_status,to_status,changed_by,changed_at')
      .eq('organization_id', input.organizationId)
      .not('from_stage_id', 'is', null)
      .order('changed_at', { ascending: false })
      .limit(sourceLimit)

    if (historyError) throw new Error(`Unable to load opportunity activity history: ${historyError.message}`)

    const historyRows = (historyData ?? []) as StageHistoryRow[]
    if (historyRows.length === 0) return []

    const opportunityIds = Array.from(new Set(historyRows.map((row) => row.opportunity_id)))
    const stageIds = Array.from(new Set(historyRows.flatMap((row) => [row.from_stage_id, row.to_stage_id]).filter((value): value is string => Boolean(value))))

    const [opportunitiesResult, stagesResult] = await Promise.all([
      supabase
        .from('opportunities')
        .select('id,organization_id,pipeline_id,contact_id,company_id,name,owner_membership_id,created_by')
        .eq('organization_id', input.organizationId)
        .in('id', opportunityIds),
      supabase
        .from('pipeline_stages')
        .select('id,name')
        .eq('organization_id', input.organizationId)
        .in('id', stageIds),
    ])

    if (opportunitiesResult.error) throw new Error(`Unable to load activity opportunities: ${opportunitiesResult.error.message}`)
    if (stagesResult.error) throw new Error(`Unable to load activity pipeline stages: ${stagesResult.error.message}`)

    const opportunities = (opportunitiesResult.data ?? []) as OpportunityRow[]
    const stages = (stagesResult.data ?? []) as StageRow[]
    const opportunityById = new Map(opportunities.map((row) => [row.id, row]))
    const stageById = new Map(stages.map((row) => [row.id, row.name]))

    return historyRows.flatMap<ActivityFeedItem>((row) => {
      const opportunity = opportunityById.get(row.opportunity_id)
      if (!opportunity) return []
      if (
        !input.canViewAllOpportunities &&
        opportunity.owner_membership_id !== input.viewerMembershipId &&
        opportunity.created_by !== input.viewerUserId
      ) {
        return []
      }

      const fromStage = row.from_stage_id ? stageById.get(row.from_stage_id) ?? 'Previous stage' : 'Previous stage'
      const toStage = stageById.get(row.to_stage_id) ?? 'New stage'
      const becameWon = row.to_status === 'won' && row.from_status !== 'won'
      const becameLost = row.to_status === 'lost' && row.from_status !== 'lost'

      let subject = `${opportunity.name} moved to ${toStage}`
      let outcome = `${fromStage} → ${toStage}`

      if (becameWon) {
        subject = `Opportunity won: ${opportunity.name}`
        outcome = 'Won'
      } else if (becameLost) {
        subject = `Opportunity lost: ${opportunity.name}`
        outcome = 'Lost'
      }

      const body = row.from_status !== row.to_status
        ? `Stage changed from ${fromStage} to ${toStage}. Status changed from ${row.from_status ?? 'open'} to ${row.to_status}.`
        : `Stage changed from ${fromStage} to ${toStage}.`

      return [{
        id: `opportunity:${row.id}`,
        sourceId: row.id,
        sourceKind: 'opportunity' as const,
        sourceLabel: becameWon ? 'Opportunity won' : becameLost ? 'Opportunity lost' : 'Opportunity stage change',
        href: `/dashboard/pipelines/${row.pipeline_id}`,
        organization_id: row.organization_id,
        contact_id: opportunity.contact_id,
        company_id: opportunity.company_id,
        opportunity_id: opportunity.id,
        activity_type: 'status_change' as const,
        direction: 'internal' as const,
        status: 'completed' as const,
        subject,
        body,
        outcome,
        occurred_at: row.changed_at,
        duration_seconds: null,
        visibility: 'organization' as const,
        owner_membership_id: opportunity.owner_membership_id,
        created_by: row.changed_by,
      }]
    })
  }

  async function loadOptionalSource(
    source: 'calls' | 'calendar' | 'opportunities',
    loader: () => Promise<ActivityFeedItem[]>,
  ): Promise<ActivityFeedItem[]> {
    try {
      return await loader()
    } catch (error) {
      console.error(`[Activities] Unable to load automatic ${source} activity source.`, error)
      return []
    }
  }

  const [manual, calls, meetings, opportunityChanges] = await Promise.all([
    loadManualActivities(),
    loadOptionalSource('calls', loadCompletedCalls),
    loadOptionalSource('calendar', loadCompletedMeetings),
    loadOptionalSource('opportunities', loadOpportunityChanges),
  ])

  return [...manual, ...calls, ...meetings, ...opportunityChanges]
    .filter((item) => matchesFeedFilters(item, input))
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, Math.min(input.limit ?? 150, 250))
}
