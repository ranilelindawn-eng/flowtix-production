begin;

alter table public.organizations
  add column if not exists business_hours jsonb not null default
  '{
    "monday":[{"start":"09:00","end":"17:00"}],
    "tuesday":[{"start":"09:00","end":"17:00"}],
    "wednesday":[{"start":"09:00","end":"17:00"}],
    "thursday":[{"start":"09:00","end":"17:00"}],
    "friday":[{"start":"09:00","end":"17:00"}],
    "saturday":[],
    "sunday":[]
  }'::jsonb,
  add column if not exists communication_policy jsonb not null default
  '{
    "allow_unknown_consent":false,
    "email_per_minute":60,
    "sms_per_minute":30,
    "calls_per_minute":10,
    "minimum_recipient_interval_seconds":60
  }'::jsonb;

create table if not exists public.contact_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  contact_id uuid not null
    references public.contacts(id)
    on delete cascade,
  do_not_contact boolean not null default false,
  email_consent_status text not null default 'unknown'
    check (email_consent_status in (
      'unknown','granted','denied','revoked','opted_out'
    )),
  sms_consent_status text not null default 'unknown'
    check (sms_consent_status in (
      'unknown','granted','denied','revoked','opted_out'
    )),
  call_consent_status text not null default 'unknown'
    check (call_consent_status in (
      'unknown','granted','denied','revoked','opted_out'
    )),
  timezone text,
  suppression_reason text,
  email_opted_out_at timestamptz,
  sms_opted_out_at timestamptz,
  call_opted_out_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id)
);

create index if not exists contact_preferences_org_contact_idx
  on public.contact_communication_preferences (
    organization_id,
    contact_id
  );

alter table public.contact_communication_preferences
  enable row level security;

drop policy if exists contact_preferences_select
  on public.contact_communication_preferences;

create policy contact_preferences_select
on public.contact_communication_preferences
for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists contact_preferences_write
  on public.contact_communication_preferences;

create policy contact_preferences_write
on public.contact_communication_preferences
for all to authenticated
using (public.is_org_writer(organization_id))
with check (public.is_org_writer(organization_id));

grant select, insert, update, delete
on public.contact_communication_preferences
to authenticated;

grant all
on public.contact_communication_preferences
to service_role;

create table if not exists public.contact_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  contact_id uuid not null
    references public.contacts(id)
    on delete cascade,
  channel text not null
    check (channel in ('email','sms','call')),
  previous_status text,
  new_status text not null,
  source text not null default 'manual',
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contact_consent_events_contact_idx
  on public.contact_consent_events (
    organization_id,
    contact_id,
    created_at desc
  );

alter table public.contact_consent_events enable row level security;

drop policy if exists contact_consent_events_select
  on public.contact_consent_events;

create policy contact_consent_events_select
on public.contact_consent_events
for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists contact_consent_events_insert
  on public.contact_consent_events;

create policy contact_consent_events_insert
on public.contact_consent_events
for insert to authenticated
with check (public.is_org_writer(organization_id));

grant select, insert
on public.contact_consent_events
to authenticated;

grant all
on public.contact_consent_events
to service_role;

create table if not exists public.automation_throttle_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  channel text not null
    check (channel in ('email','sms','call')),
  recipient_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists automation_throttle_events_org_channel_idx
  on public.automation_throttle_events (
    organization_id,
    channel,
    created_at desc
  );

create index if not exists automation_throttle_events_recipient_idx
  on public.automation_throttle_events (
    organization_id,
    channel,
    recipient_hash,
    created_at desc
  );

alter table public.automation_throttle_events enable row level security;

revoke all
on public.automation_throttle_events
from anon, authenticated;

grant all
on public.automation_throttle_events
to service_role;

create or replace function public.acquire_automation_throttle(
  target_org uuid,
  throttle_channel text,
  recipient_hash_value text,
  maximum_events integer,
  window_seconds integer,
  minimum_recipient_interval_seconds integer
)
returns table (
  allowed boolean,
  reason text,
  retry_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_org_count integer;
  v_last_recipient timestamptz;
begin
  if target_org is null
    or throttle_channel not in ('email','sms','call')
    or recipient_hash_value is null
    or btrim(recipient_hash_value) = ''
    or maximum_events < 1
    or window_seconds < 1
    or minimum_recipient_interval_seconds < 1
  then
    raise exception 'Invalid automation throttle request.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_org::text || ':' || throttle_channel,
      0
    )
  );

  v_window_start :=
    v_now - make_interval(secs => window_seconds);

  select count(*)
  into v_org_count
  from public.automation_throttle_events
  where organization_id = target_org
    and channel = throttle_channel
    and created_at >= v_window_start;

  if v_org_count >= maximum_events then
    return query
    select
      false,
      'WORKSPACE_RATE_LIMIT',
      coalesce(
        (
          select min(created_at)
            + make_interval(secs => window_seconds)
          from public.automation_throttle_events
          where organization_id = target_org
            and channel = throttle_channel
            and created_at >= v_window_start
        ),
        v_now + interval '1 minute'
      );
    return;
  end if;

  select max(created_at)
  into v_last_recipient
  from public.automation_throttle_events
  where organization_id = target_org
    and channel = throttle_channel
    and recipient_hash = recipient_hash_value;

  if v_last_recipient is not null
    and v_last_recipient
      + make_interval(
          secs => minimum_recipient_interval_seconds
        ) > v_now
  then
    return query
    select
      false,
      'RECIPIENT_RATE_LIMIT',
      v_last_recipient
        + make_interval(
            secs => minimum_recipient_interval_seconds
          );
    return;
  end if;

  insert into public.automation_throttle_events (
    organization_id,
    channel,
    recipient_hash,
    created_at
  )
  values (
    target_org,
    throttle_channel,
    recipient_hash_value,
    v_now
  );

  return query
  select true, null::text, null::timestamptz;
end;
$$;

revoke all
on function public.acquire_automation_throttle(
  uuid,
  text,
  text,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function public.acquire_automation_throttle(
  uuid,
  text,
  text,
  integer,
  integer,
  integer
)
to service_role;

create or replace function public.defer_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_scheduled_at timestamptz,
  p_reason_code text,
  p_reason_message text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.background_jobs;
begin
  update public.background_jobs
  set
    status = 'scheduled',
    scheduled_at = greatest(
      coalesce(p_scheduled_at, now() + interval '1 minute'),
      now() + interval '1 second'
    ),
    next_retry_at = null,
    locked_by = null,
    locked_at = null,
    heartbeat_at = null,
    lock_expires_at = null,
    last_error_code = nullif(btrim(p_reason_code), ''),
    last_error_message = nullif(btrim(p_reason_message), ''),
    updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = p_worker_id
  returning *
  into v_job;

  if v_job.id is null then
    return false;
  end if;

  insert into public.background_job_events (
    job_id,
    organization_id,
    event_type,
    from_status,
    to_status,
    worker_id,
    message,
    metadata
  )
  values (
    v_job.id,
    v_job.organization_id,
    'deferred',
    'processing',
    'scheduled',
    p_worker_id,
    p_reason_message,
    jsonb_build_object(
      'reason_code',
      p_reason_code,
      'scheduled_at',
      v_job.scheduled_at
    )
  );

  return true;
end;
$$;

revoke all
on function public.defer_background_job(
  uuid,
  text,
  timestamptz,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.defer_background_job(
  uuid,
  text,
  timestamptz,
  text,
  text
)
to service_role;

create or replace function public.cleanup_automation_throttle_events(
  retention_interval interval default interval '7 days'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted integer;
begin
  delete from public.automation_throttle_events
  where created_at < now() - retention_interval;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all
on function public.cleanup_automation_throttle_events(interval)
from public, anon, authenticated;

grant execute
on function public.cleanup_automation_throttle_events(interval)
to service_role;

commit;
