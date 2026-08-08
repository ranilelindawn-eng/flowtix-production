-- Flowtix Automation 1.6
-- Durable post-call automation dispatch job creation + business-level idempotency.
--
-- This phase intentionally queues jobs into a dedicated `post_call` queue.
-- The existing worker does not claim that queue yet. Automation 1.7 will
-- register the dispatcher/template-rendering handler before the queue is
-- activated for processing. This prevents a partially implemented dispatcher
-- from being consumed during staged deployment.

begin;

create or replace function public.enqueue_post_call_automation_job(
  p_organization_id uuid,
  p_call_id uuid,
  p_call_status public.call_status,
  p_occurred_at timestamptz,
  p_delay_seconds integer default 0,
  p_email_enabled boolean default false,
  p_sms_enabled boolean default false
)
returns public.background_jobs
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_call public.calls%rowtype;
  v_job public.background_jobs;
  v_delay integer := greatest(0, least(coalesce(p_delay_seconds, 0), 604800));
  v_idempotency_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;

  if p_organization_id is null or p_call_id is null then
    raise exception 'Organization ID and call ID are required.'
      using errcode = '22023';
  end if;

  if p_call_status not in (
    'completed'::public.call_status,
    'failed'::public.call_status,
    'cancelled'::public.call_status
  ) then
    raise exception 'Post-call automation requires a terminal call status.'
      using errcode = '22023';
  end if;

  if not coalesce(p_email_enabled, false)
     and not coalesce(p_sms_enabled, false) then
    raise exception 'At least one post-call communication channel is required.'
      using errcode = '22023';
  end if;

  select call_record.*
  into v_call
  from public.calls as call_record
  where call_record.id = p_call_id
    and call_record.organization_id = p_organization_id;

  if not found then
    raise exception 'The call does not belong to the organization.'
      using errcode = '22023';
  end if;

  if v_call.status <> p_call_status then
    raise exception 'The persisted call status does not match the post-call trigger.'
      using errcode = '22023';
  end if;

  v_idempotency_key :=
    'post-call-dispatch:' || p_call_id::text || ':' || p_call_status::text;

  insert into public.background_jobs (
    organization_id,
    queue,
    job_type,
    payload,
    status,
    priority,
    scheduled_at,
    max_attempts,
    idempotency_key,
    created_by
  )
  values (
    p_organization_id,
    'post_call',
    'automation.post_call.dispatch',
    jsonb_build_object(
      'organizationId', p_organization_id,
      'callId', p_call_id,
      'callStatus', p_call_status::text,
      'occurredAt', coalesce(p_occurred_at, now()),
      'emailEnabled', coalesce(p_email_enabled, false),
      'smsEnabled', coalesce(p_sms_enabled, false)
    ),
    case
      when now() + make_interval(secs => v_delay) > now()
        then 'scheduled'
      else 'queued'
    end,
    60,
    now() + make_interval(secs => v_delay),
    8,
    v_idempotency_key,
    null
  )
  on conflict (organization_id, idempotency_key)
    where idempotency_key is not null
  do update
    set updated_at = public.background_jobs.updated_at
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.enqueue_post_call_automation_job(
  uuid,
  uuid,
  public.call_status,
  timestamptz,
  integer,
  boolean,
  boolean
) from public, anon, authenticated;

grant execute on function public.enqueue_post_call_automation_job(
  uuid,
  uuid,
  public.call_status,
  timestamptz,
  integer,
  boolean,
  boolean
) to service_role;

comment on function public.enqueue_post_call_automation_job(
  uuid,
  uuid,
  public.call_status,
  timestamptz,
  integer,
  boolean,
  boolean
) is
  'Creates one durable provider-neutral post-call dispatch job per organization/call/terminal-status. Duplicate webhook delivery reuses the existing job through the background_jobs idempotency index.';

commit;
