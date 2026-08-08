import { createClient } from '@/lib/supabase/server'

export type QueueHealthRow = {
  queue: string
  queued: number
  scheduled: number
  processing: number
  retrying: number
  completed: number
  failed: number
  dead_letter: number
  oldest_pending_at: string | null
  newest_activity_at: string | null
}

export type SchedulerRun = {
  id: string
  scheduler: string
  status: string
  started_at: string
  completed_at: string | null
  scheduled_count: number
  skipped_count: number
  error_message: string | null
}

export type AutomationSummary = {
  activeSequences: number
  activeSequenceEnrollments: number
  activeCampaigns: number
  reservedCampaignMembers: number
  queuedCommunications: number
  failedCommunications: number
  pendingPostCallDispatches: number
  failedPostCallDispatches: number
  postCallEmails: number
  postCallSms: number
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getQueueHealth(
  organizationId: string,
): Promise<QueueHealthRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'get_automation_queue_health',
    { p_organization_id: organizationId },
  )

  if (error) {
    throw new Error(
      `Unable to load automation queue health: ${error.message}`,
    )
  }

  if (!Array.isArray(data)) {
    return []
  }

  return data.map((row) => ({
    queue: String(row.queue ?? ''),
    queued: numberValue(row.queued),
    scheduled: numberValue(row.scheduled),
    processing: numberValue(row.processing),
    retrying: numberValue(row.retrying),
    completed: numberValue(row.completed),
    failed: numberValue(row.failed),
    dead_letter: numberValue(row.dead_letter),
    oldest_pending_at:
      typeof row.oldest_pending_at === 'string'
        ? row.oldest_pending_at
        : null,
    newest_activity_at:
      typeof row.newest_activity_at === 'string'
        ? row.newest_activity_at
        : null,
  }))
}

export async function getSchedulerRuns(
  organizationId: string,
): Promise<SchedulerRun[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('automation_scheduler_runs')
    .select(
      'id,scheduler,status,started_at,completed_at,scheduled_count,skipped_count,error_message',
    )
    .eq('organization_id', organizationId)
    .order('started_at', { ascending: false })
    .limit(20)

  if (error) {
    throw new Error(
      `Unable to load scheduler history: ${error.message}`,
    )
  }

  return (data ?? []) as SchedulerRun[]
}

export async function getAutomationSummary(
  organizationId: string,
): Promise<AutomationSummary> {
  const supabase = await createClient()

  const [
    sequences,
    enrollments,
    campaigns,
    campaignMembers,
    queuedMessages,
    failedMessages,
    pendingPostCallDispatches,
    failedPostCallDispatches,
    postCallEmails,
    postCallSms,
  ] = await Promise.all([
    supabase
      .from('sequences')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    supabase
      .from('sequence_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    supabase
      .from('campaign_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'calling'),
    supabase
      .from('communication_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['queued', 'processing']),
    supabase
      .from('communication_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'failed'),
    supabase
      .from('background_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('queue', 'post_call')
      .in('status', ['queued', 'scheduled', 'processing', 'retrying']),
    supabase
      .from('background_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('queue', 'post_call')
      .in('status', ['failed', 'dead_letter']),
    supabase
      .from('communication_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('source', 'post_call_email'),
    supabase
      .from('communication_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('source', 'post_call_sms'),
  ])

  return {
    activeSequences: sequences.count ?? 0,
    activeSequenceEnrollments: enrollments.count ?? 0,
    activeCampaigns: campaigns.count ?? 0,
    reservedCampaignMembers: campaignMembers.count ?? 0,
    queuedCommunications: queuedMessages.count ?? 0,
    failedCommunications: failedMessages.count ?? 0,
    pendingPostCallDispatches: pendingPostCallDispatches.count ?? 0,
    failedPostCallDispatches: failedPostCallDispatches.count ?? 0,
    postCallEmails: postCallEmails.count ?? 0,
    postCallSms: postCallSms.count ?? 0,
  }
}
