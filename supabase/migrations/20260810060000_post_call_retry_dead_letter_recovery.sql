-- Flowtix Automation 1.10
-- Retry / Dead-Letter / Recovery integration for post-call automation.
--
-- The core background-job worker already provides:
--   * exponential retry backoff through fail_background_job(...)
--   * dead-letter transition when max_attempts is exhausted
--   * stale processing-job recovery through recover_stale_background_jobs(...)
--   * manual failed/dead-letter recovery through retry_failed_automation_jobs(...)
--
-- This migration extends the existing Automation operations/monitoring RPCs so
-- the new `post_call` queue participates in queue health and manual recovery.
-- It preserves the authorization hardening already applied to these RPCs.

begin;

create or replace function public.get_automation_queue_health(
  p_organization_id uuid
)
returns table (
  queue text,
  queued bigint,
  scheduled bigint,
  processing bigint,
  retrying bigint,
  completed bigint,
  failed bigint,
  dead_letter bigint,
  oldest_pending_at timestamptz,
  newest_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_organization_id is null then
    raise exception 'organization_required'
      using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_org_member(p_organization_id)
  then
    raise exception 'Not authorized to view automation queue health.'
      using errcode = '42501';
  end if;

  return query
  select
    job.queue,
    count(*) filter (where job.status = 'queued') as queued,
    count(*) filter (where job.status = 'scheduled') as scheduled,
    count(*) filter (where job.status = 'processing') as processing,
    count(*) filter (where job.status = 'retrying') as retrying,
    count(*) filter (where job.status = 'completed') as completed,
    count(*) filter (where job.status = 'failed') as failed,
    count(*) filter (where job.status = 'dead_letter') as dead_letter,
    min(
      coalesce(job.next_retry_at, job.scheduled_at)
    ) filter (
      where job.status in (
        'queued',
        'scheduled',
        'processing',
        'retrying'
      )
    ) as oldest_pending_at,
    max(job.updated_at) as newest_activity_at
  from public.background_jobs as job
  where job.organization_id = p_organization_id
    and job.queue in (
      'communications',
      'post_call',
      'sequences',
      'campaigns',
      'calendar_sync',
      'oauth_refresh'
    )
  group by job.queue
  order by job.queue;
end;
$$;

revoke all
on function public.get_automation_queue_health(uuid)
from public, anon;

grant execute
on function public.get_automation_queue_health(uuid)
to authenticated, service_role;

create or replace function public.retry_failed_automation_jobs(
  p_organization_id uuid,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_retried integer;
begin
  if p_organization_id is null then
    raise exception 'organization_required'
      using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_org_admin(p_organization_id)
  then
    raise exception 'Not authorized to retry automation jobs.'
      using errcode = '42501';
  end if;

  with candidates as (
    select job.id
    from public.background_jobs as job
    where job.organization_id = p_organization_id
      and job.queue in (
        'communications',
        'post_call',
        'sequences',
        'campaigns',
        'calendar_sync',
        'oauth_refresh'
      )
      and job.status in ('failed', 'dead_letter')
    order by job.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  )
  update public.background_jobs as job
  set
    status = 'queued',
    scheduled_at = now(),
    next_retry_at = null,
    locked_by = null,
    locked_at = null,
    heartbeat_at = null,
    lock_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    failed_at = null,
    completed_at = null,
    updated_at = now()
  from candidates
  where job.id = candidates.id;

  get diagnostics v_retried = row_count;

  return v_retried;
end;
$$;

revoke all
on function public.retry_failed_automation_jobs(uuid, integer)
from public, anon;

grant execute
on function public.retry_failed_automation_jobs(uuid, integer)
to authenticated, service_role;

comment on function public.get_automation_queue_health(uuid) is
  'Organization-scoped automation queue health, including the durable post_call queue.';

comment on function public.retry_failed_automation_jobs(uuid, integer) is
  'Requeues failed/dead-letter automation jobs, including durable post_call dispatch jobs, for an authorized organization administrator or service role.';

commit;
