begin;

create table if not exists public.automation_controls (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,
  global_paused boolean not null default false,
  communications_paused boolean not null default false,
  sequences_paused boolean not null default false,
  campaigns_paused boolean not null default false,
  pause_reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.automation_controls (organization_id)
select id
from public.organizations
on conflict (organization_id) do nothing;

alter table public.automation_controls enable row level security;

drop policy if exists automation_controls_select
  on public.automation_controls;

create policy automation_controls_select
on public.automation_controls
for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists automation_controls_write
  on public.automation_controls;

create policy automation_controls_write
on public.automation_controls
for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

grant select, insert, update
on public.automation_controls
to authenticated;

grant all
on public.automation_controls
to service_role;

create table if not exists public.automation_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid
    references public.organizations(id)
    on delete cascade,
  scheduler text not null,
  status text not null default 'running'
    check (status in ('running','completed','failed','skipped')),
  scheduled_count integer not null default 0,
  skipped_count integer not null default 0,
  recovered_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists automation_scheduler_runs_org_started_idx
  on public.automation_scheduler_runs (
    organization_id,
    started_at desc
  );

alter table public.automation_scheduler_runs enable row level security;

drop policy if exists automation_scheduler_runs_select
  on public.automation_scheduler_runs;

create policy automation_scheduler_runs_select
on public.automation_scheduler_runs
for select to authenticated
using (
  organization_id is not null
  and public.is_org_member(organization_id)
);

revoke insert, update, delete
on public.automation_scheduler_runs
from authenticated;

grant select
on public.automation_scheduler_runs
to authenticated;

grant all
on public.automation_scheduler_runs
to service_role;

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
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
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
      'sequences',
      'campaigns',
      'calendar_sync',
      'oauth_refresh'
    )
  group by job.queue
  order by job.queue;
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
  if not public.is_org_admin(p_organization_id)
    and auth.role() <> 'service_role'
  then
    raise exception 'Not authorized to retry automation jobs.'
      using errcode = '42501';
  end if;

  with candidates as (
    select id
    from public.background_jobs
    where organization_id = p_organization_id
      and queue in (
        'communications',
        'sequences',
        'campaigns',
        'calendar_sync',
        'oauth_refresh'
      )
      and status in ('failed', 'dead_letter')
    order by updated_at asc
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

commit;
