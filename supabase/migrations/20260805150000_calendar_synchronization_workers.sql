begin;

alter table public.calendar_events
  add column if not exists calendar_sync_provider text not null default 'none',
  add column if not exists calendar_sync_status text not null default 'disabled',
  add column if not exists calendar_sync_revision integer not null default 1,
  add column if not exists calendar_sync_job_id uuid
    references public.background_jobs(id) on delete set null,
  add column if not exists calendar_sync_error text,
  add column if not exists calendar_synced_at timestamptz,
  add column if not exists external_calendar_event_id text,
  add column if not exists external_calendar_event_url text,
  add column if not exists external_calendar_etag text,
  add column if not exists deleted_at timestamptz;

alter table public.calendar_events
  drop constraint if exists calendar_events_calendar_sync_provider_check;
alter table public.calendar_events
  add constraint calendar_events_calendar_sync_provider_check
  check (calendar_sync_provider in ('none','google-calendar','outlook'));

alter table public.calendar_events
  drop constraint if exists calendar_events_calendar_sync_status_check;
alter table public.calendar_events
  add constraint calendar_events_calendar_sync_status_check
  check (
    calendar_sync_status in (
      'disabled','pending','processing','synced','failed'
    )
  );

alter table public.calendar_events
  drop constraint if exists calendar_events_calendar_sync_revision_check;
alter table public.calendar_events
  add constraint calendar_events_calendar_sync_revision_check
  check (calendar_sync_revision >= 1);

update public.calendar_events
set
  calendar_sync_provider = 'google-calendar',
  calendar_sync_status = 'synced',
  external_calendar_event_id = google_event_id,
  external_calendar_event_url = google_event_url,
  calendar_synced_at = coalesce(updated_at, created_at)
where google_event_id is not null
  and calendar_sync_provider = 'none';

create index if not exists calendar_events_sync_pending_idx
  on public.calendar_events (calendar_sync_status, updated_at)
  where calendar_sync_provider <> 'none';

create index if not exists calendar_events_external_calendar_idx
  on public.calendar_events (
    organization_id,
    calendar_sync_provider,
    external_calendar_event_id
  )
  where external_calendar_event_id is not null;

create index if not exists calendar_events_visible_org_start_idx
  on public.calendar_events (organization_id, starts_at)
  where deleted_at is null;

create table if not exists public.calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  calendar_event_id uuid
    references public.calendar_events(id) on delete set null,
  provider text not null
    check (provider in ('google-calendar','outlook')),
  action text not null
    check (action in ('upsert','delete')),
  revision integer not null,
  status text not null
    check (status in ('completed','failed','skipped')),
  provider_event_id text,
  provider_event_url text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists calendar_sync_runs_org_started_idx
  on public.calendar_sync_runs (organization_id, started_at desc);

create index if not exists calendar_sync_runs_event_idx
  on public.calendar_sync_runs (calendar_event_id, revision desc);

alter table public.calendar_sync_runs enable row level security;

drop policy if exists calendar_sync_runs_select
  on public.calendar_sync_runs;
create policy calendar_sync_runs_select
on public.calendar_sync_runs
for select to authenticated
using (public.is_org_member(organization_id));

revoke insert, update, delete
on public.calendar_sync_runs
from authenticated;

grant select on public.calendar_sync_runs to authenticated;
grant all on public.calendar_sync_runs to service_role;

create or replace function public.enqueue_pending_calendar_sync_jobs(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
  v_event record;
  v_job_id uuid;
  v_action text;
begin
  for v_event in
    select
      event.id,
      event.organization_id,
      event.calendar_sync_revision,
      event.deleted_at
    from public.calendar_events as event
    where event.calendar_sync_provider <> 'none'
      and event.calendar_sync_status in ('pending','failed')
    order by event.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    v_action :=
      case when v_event.deleted_at is null
        then 'upsert'
        else 'delete'
      end;

    insert into public.background_jobs (
      organization_id,
      queue,
      job_type,
      payload,
      status,
      priority,
      scheduled_at,
      max_attempts,
      idempotency_key
    )
    values (
      v_event.organization_id,
      'calendar_sync',
      'calendar.sync_event',
      jsonb_build_object(
        'organizationId', v_event.organization_id,
        'eventId', v_event.id,
        'revision', v_event.calendar_sync_revision,
        'action', v_action
      ),
      'queued',
      70,
      now(),
      8,
      'calendar-sync:' ||
        v_event.id::text || ':' ||
        v_event.calendar_sync_revision::text ||
        ':' || v_action
    )
    on conflict (
      organization_id,
      idempotency_key
    )
    where idempotency_key is not null
    do update set
      scheduled_at = least(
        public.background_jobs.scheduled_at,
        excluded.scheduled_at
      ),
      updated_at = now()
    returning id into v_job_id;

    update public.calendar_events
    set
      calendar_sync_job_id = v_job_id,
      updated_at = now()
    where id = v_event.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all
on function public.enqueue_pending_calendar_sync_jobs(integer)
from public, anon, authenticated;

grant execute
on function public.enqueue_pending_calendar_sync_jobs(integer)
to service_role;

commit;
