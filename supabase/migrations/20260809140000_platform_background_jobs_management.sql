-- Flowtix Platform Admin — Background Jobs Management
--
-- Adds staff-only cross-tenant visibility and controlled job recovery on top
-- of the existing durable background_jobs/background_job_events engine.
--
-- Existing worker claim/heartbeat/complete/fail RPCs remain unchanged.
-- Existing background_job_events triggers remain authoritative.
-- Platform actions require a reason and are also written to platform_audit_logs.

begin;

create index if not exists background_jobs_status_updated_platform_idx
  on public.background_jobs(status, updated_at desc);

create index if not exists background_jobs_queue_updated_platform_idx
  on public.background_jobs(queue, updated_at desc);

create index if not exists background_jobs_job_type_updated_platform_idx
  on public.background_jobs(job_type, updated_at desc);

create or replace function public.platform_can_view_jobs()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.platform_users platform_user
      where platform_user.user_id = auth.uid()
        and platform_user.is_active = true
        and platform_user.role in (
          'platform_owner',
          'platform_admin',
          'support',
          'developer'
        )
    );
$function$;

create or replace function public.platform_can_manage_jobs()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.platform_users platform_user
      where platform_user.user_id = auth.uid()
        and platform_user.is_active = true
        and platform_user.role in (
          'platform_owner',
          'platform_admin',
          'developer'
        )
    );
$function$;

create or replace function public.platform_job_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_view_jobs() then
    raise exception 'PLATFORM_JOBS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'queued',
      count(*) filter (where job.status = 'queued'),
    'scheduled',
      count(*) filter (where job.status = 'scheduled'),
    'processing',
      count(*) filter (where job.status = 'processing'),
    'retrying',
      count(*) filter (where job.status = 'retrying'),
    'completedLast24Hours',
      count(*) filter (
        where job.status = 'completed'
          and coalesce(job.completed_at, job.updated_at) >=
            pg_catalog.now() - interval '24 hours'
      ),
    'failedLast24Hours',
      count(*) filter (
        where job.status = 'failed'
          and coalesce(job.failed_at, job.updated_at) >=
            pg_catalog.now() - interval '24 hours'
      ),
    'deadLetter',
      count(*) filter (where job.status = 'dead_letter'),
    'cancelledLast24Hours',
      count(*) filter (
        where job.status = 'cancelled'
          and job.updated_at >= pg_catalog.now() - interval '24 hours'
      ),
    'staleProcessing',
      count(*) filter (
        where job.status = 'processing'
          and job.lock_expires_at is not null
          and job.lock_expires_at <= pg_catalog.now()
      ),
    'queues',
      count(distinct job.queue)
  )
  into result
  from public.background_jobs job;

  return result;
end;
$function$;

create or replace function public.platform_job_directory(
  p_search text default null,
  p_status text default null,
  p_queue text default null,
  p_job_type text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
  normalized_search text :=
    nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_status text :=
    nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, ''))), '');
  normalized_queue text :=
    nullif(pg_catalog.btrim(coalesce(p_queue, '')), '');
  normalized_job_type text :=
    nullif(pg_catalog.btrim(coalesce(p_job_type, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.platform_can_view_jobs() then
    raise exception 'PLATFORM_JOBS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_status is not null
     and normalized_status not in (
       'queued',
       'scheduled',
       'processing',
       'retrying',
       'completed',
       'failed',
       'cancelled',
       'dead_letter'
     ) then
    raise exception 'INVALID_BACKGROUND_JOB_STATUS'
      using errcode = '22023';
  end if;

  with filtered as (
    select
      job.id,
      job.organization_id,
      organization.name as organization_name,
      job.queue,
      job.job_type,
      job.status,
      job.priority,
      job.attempt_count,
      job.max_attempts,
      job.scheduled_at,
      job.started_at,
      job.completed_at,
      job.failed_at,
      job.next_retry_at,
      job.locked_by,
      job.heartbeat_at,
      job.lock_expires_at,
      job.last_error_code,
      job.last_error_message,
      job.created_at,
      job.updated_at
    from public.background_jobs job
    left join public.organizations organization
      on organization.id = job.organization_id
    where (
        normalized_status is null
        or job.status = normalized_status
      )
      and (
        normalized_queue is null
        or job.queue = normalized_queue
      )
      and (
        normalized_job_type is null
        or job.job_type = normalized_job_type
      )
      and (
        normalized_search is null
        or job.id::text ilike '%' || normalized_search || '%'
        or job.queue ilike '%' || normalized_search || '%'
        or job.job_type ilike '%' || normalized_search || '%'
        or coalesce(organization.name, '') ilike '%' || normalized_search || '%'
        or coalesce(job.last_error_code, '') ilike '%' || normalized_search || '%'
        or coalesce(job.last_error_message, '') ilike '%' || normalized_search || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by
      case
        when status = 'dead_letter' then 0
        when status = 'failed' then 1
        when status = 'processing'
          and lock_expires_at is not null
          and lock_expires_at <= pg_catalog.now() then 2
        when status = 'retrying' then 3
        when status = 'queued' then 4
        when status = 'scheduled' then 5
        when status = 'processing' then 6
        when status = 'cancelled' then 7
        else 8
      end,
      updated_at desc
    limit safe_limit
    offset safe_offset
  )
  select jsonb_build_object(
    'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', row_item.id,
              'organizationId', row_item.organization_id,
              'organizationName', row_item.organization_name,
              'queue', row_item.queue,
              'jobType', row_item.job_type,
              'status', row_item.status,
              'priority', row_item.priority,
              'attemptCount', row_item.attempt_count,
              'maxAttempts', row_item.max_attempts,
              'scheduledAt', row_item.scheduled_at,
              'startedAt', row_item.started_at,
              'completedAt', row_item.completed_at,
              'failedAt', row_item.failed_at,
              'nextRetryAt', row_item.next_retry_at,
              'lockedBy', row_item.locked_by,
              'heartbeatAt', row_item.heartbeat_at,
              'lockExpiresAt', row_item.lock_expires_at,
              'lastErrorCode', row_item.last_error_code,
              'lastErrorMessage', row_item.last_error_message,
              'createdAt', row_item.created_at,
              'updatedAt', row_item.updated_at
            )
            order by row_item.updated_at desc
          )
          from page_rows row_item
        ),
        '[]'::jsonb
      ),
    'total', (select count(*) from filtered),
    'limit', safe_limit,
    'offset', safe_offset,
    'queues',
      coalesce(
        (
          select jsonb_agg(queue_name order by queue_name)
          from (
            select distinct job.queue as queue_name
            from public.background_jobs job
          ) queues
        ),
        '[]'::jsonb
      ),
    'jobTypes',
      coalesce(
        (
          select jsonb_agg(job_type order by job_type)
          from (
            select distinct job.job_type
            from public.background_jobs job
          ) types
        ),
        '[]'::jsonb
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_job_detail(
  p_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  job_row public.background_jobs%rowtype;
  organization_name text;
  result jsonb;
begin
  if not public.platform_can_view_jobs() then
    raise exception 'PLATFORM_JOBS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select job.*
  into job_row
  from public.background_jobs job
  where job.id = p_job_id;

  if job_row.id is null then
    return null;
  end if;

  select organization.name
  into organization_name
  from public.organizations organization
  where organization.id = job_row.organization_id;

  select jsonb_build_object(
    'id', job_row.id,
    'organizationId', job_row.organization_id,
    'organizationName', organization_name,
    'queue', job_row.queue,
    'jobType', job_row.job_type,
    'status', job_row.status,
    'priority', job_row.priority,
    'attemptCount', job_row.attempt_count,
    'maxAttempts', job_row.max_attempts,
    'scheduledAt', job_row.scheduled_at,
    'startedAt', job_row.started_at,
    'completedAt', job_row.completed_at,
    'failedAt', job_row.failed_at,
    'nextRetryAt', job_row.next_retry_at,
    'lockedBy', job_row.locked_by,
    'heartbeatAt', job_row.heartbeat_at,
    'lockExpiresAt', job_row.lock_expires_at,
    'lastErrorCode', job_row.last_error_code,
    'lastErrorMessage', job_row.last_error_message,
    'createdAt', job_row.created_at,
    'updatedAt', job_row.updated_at,
    'idempotencyKey', job_row.idempotency_key,
    'partitionKey', job_row.partition_key,
    'payload',
      public.platform_audit_sanitize_json(job_row.payload),
    'result',
      public.platform_audit_sanitize_json(job_row.result),
    'events',
      coalesce(
        (
          select jsonb_agg(event_json)
          from (
            select jsonb_build_object(
              'id', event.id,
              'eventType', event.event_type,
              'fromStatus', event.from_status,
              'toStatus', event.to_status,
              'workerId', event.worker_id,
              'message', event.message,
              'metadata',
                public.platform_audit_sanitize_json(event.metadata),
              'createdBy', event.created_by,
              'createdAt', event.created_at
            ) as event_json
            from public.background_job_events event
            where event.job_id = job_row.id
            order by event.created_at desc
            limit 100
          ) recent_events
        ),
        '[]'::jsonb
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_retry_background_job(
  p_job_id uuid,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  job_row public.background_jobs%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'developer'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_JOBS_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'BACKGROUND_JOB_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select job.*
  into job_row
  from public.background_jobs job
  where job.id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'BACKGROUND_JOB_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if job_row.status not in ('failed', 'dead_letter', 'cancelled') then
    raise exception 'BACKGROUND_JOB_NOT_RETRYABLE'
      using errcode = '22023';
  end if;

  update public.background_jobs
  set
    status = 'queued',
    scheduled_at = pg_catalog.now(),
    next_retry_at = null,
    started_at = null,
    completed_at = null,
    failed_at = null,
    locked_by = null,
    locked_at = null,
    heartbeat_at = null,
    lock_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    result = null,
    attempt_count = 0
  where id = job_row.id;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'jobs.background_job_retried',
    'background_job',
    job_row.id::text,
    job_row.organization_id,
    normalized_reason,
    jsonb_build_object(
      'status', job_row.status,
      'attemptCount', job_row.attempt_count,
      'lastErrorCode', job_row.last_error_code
    ),
    jsonb_build_object(
      'status', 'queued',
      'attemptCount', 0
    ),
    jsonb_build_object(
      'queue', job_row.queue,
      'jobType', job_row.job_type,
      'payloadPreserved', true
    )
  );

  return true;
end;
$function$;

create or replace function public.platform_cancel_background_job(
  p_job_id uuid,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  job_row public.background_jobs%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'developer'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_JOBS_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'BACKGROUND_JOB_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select job.*
  into job_row
  from public.background_jobs job
  where job.id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'BACKGROUND_JOB_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if job_row.status not in ('queued', 'scheduled', 'retrying') then
    raise exception 'BACKGROUND_JOB_NOT_CANCELLABLE'
      using errcode = '22023';
  end if;

  update public.background_jobs
  set
    status = 'cancelled',
    failed_at = pg_catalog.now(),
    next_retry_at = null,
    locked_by = null,
    locked_at = null,
    heartbeat_at = null,
    lock_expires_at = null,
    last_error_code = 'CANCELLED_BY_PLATFORM',
    last_error_message = left(
      'Cancelled by Flowtix Platform staff. Reason: ' || normalized_reason,
      4000
    )
  where id = job_row.id;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'jobs.background_job_cancelled',
    'background_job',
    job_row.id::text,
    job_row.organization_id,
    normalized_reason,
    jsonb_build_object(
      'status', job_row.status,
      'scheduledAt', job_row.scheduled_at,
      'nextRetryAt', job_row.next_retry_at
    ),
    jsonb_build_object(
      'status', 'cancelled'
    ),
    jsonb_build_object(
      'queue', job_row.queue,
      'jobType', job_row.job_type
    )
  );

  return true;
end;
$function$;

create or replace function public.platform_recover_stale_background_job(
  p_job_id uuid,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  job_row public.background_jobs%rowtype;
  resulting_status text;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'developer'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_JOBS_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'BACKGROUND_JOB_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select job.*
  into job_row
  from public.background_jobs job
  where job.id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'BACKGROUND_JOB_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if job_row.status <> 'processing'
     or job_row.lock_expires_at is null
     or job_row.lock_expires_at > pg_catalog.now() then
    raise exception 'BACKGROUND_JOB_LEASE_NOT_STALE'
      using errcode = '22023';
  end if;

  resulting_status := case
    when job_row.attempt_count >= job_row.max_attempts
      then 'dead_letter'
    else 'retrying'
  end;

  update public.background_jobs
  set
    status = resulting_status,
    failed_at = case
      when resulting_status = 'dead_letter'
        then pg_catalog.now()
      else failed_at
    end,
    next_retry_at = case
      when resulting_status = 'retrying'
        then pg_catalog.now()
      else null
    end,
    locked_by = null,
    locked_at = null,
    heartbeat_at = null,
    lock_expires_at = null,
    last_error_code = 'STALE_WORKER_LEASE',
    last_error_message =
      'The worker lease expired before the job completed. Recovered by Flowtix Platform staff.'
  where id = job_row.id;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'jobs.stale_lease_recovered',
    'background_job',
    job_row.id::text,
    job_row.organization_id,
    normalized_reason,
    jsonb_build_object(
      'status', job_row.status,
      'lockedBy', job_row.locked_by,
      'lockExpiresAt', job_row.lock_expires_at,
      'attemptCount', job_row.attempt_count,
      'maxAttempts', job_row.max_attempts
    ),
    jsonb_build_object(
      'status', resulting_status,
      'lockedBy', null,
      'lockExpiresAt', null
    ),
    jsonb_build_object(
      'queue', job_row.queue,
      'jobType', job_row.job_type
    )
  );

  return true;
end;
$function$;

revoke all on function public.platform_can_view_jobs()
from public, anon;

revoke all on function public.platform_can_manage_jobs()
from public, anon;

revoke all on function public.platform_job_metrics()
from public, anon;

revoke all on function public.platform_job_directory(
  text,
  text,
  text,
  text,
  integer,
  integer
)
from public, anon;

revoke all on function public.platform_job_detail(uuid)
from public, anon;

revoke all on function public.platform_retry_background_job(uuid,text)
from public, anon;

revoke all on function public.platform_cancel_background_job(uuid,text)
from public, anon;

revoke all on function public.platform_recover_stale_background_job(uuid,text)
from public, anon;

grant execute on function public.platform_can_view_jobs()
to authenticated;

grant execute on function public.platform_can_manage_jobs()
to authenticated;

grant execute on function public.platform_job_metrics()
to authenticated;

grant execute on function public.platform_job_directory(
  text,
  text,
  text,
  text,
  integer,
  integer
)
to authenticated;

grant execute on function public.platform_job_detail(uuid)
to authenticated;

grant execute on function public.platform_retry_background_job(uuid,text)
to authenticated;

grant execute on function public.platform_cancel_background_job(uuid,text)
to authenticated;

grant execute on function public.platform_recover_stale_background_job(uuid,text)
to authenticated;

notify pgrst, 'reload schema';

commit;
