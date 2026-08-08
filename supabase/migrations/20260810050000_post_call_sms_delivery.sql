-- Flowtix Automation 1.9
-- Post-call SMS delivery + transactional communication/job creation.
--
-- This function is the shared durable boundary for BOTH post-call email and
-- post-call SMS. It also hardens the email path introduced in Automation 1.8
-- by performing message + communications.send job creation transactionally
-- in PostgreSQL and by using the existing partial idempotency indexes exactly.

begin;

create or replace function public.enqueue_post_call_communication(
  p_dispatch_job_id uuid,
  p_organization_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_recipient text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_source text;
  v_message public.communication_messages;
  v_job public.background_jobs;
  v_replay boolean := false;
  v_job_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.'
      using errcode = '42501';
  end if;

  if p_dispatch_job_id is null
     or p_organization_id is null
     or p_contact_id is null then
    raise exception 'Dispatch job, organization, and contact are required.'
      using errcode = '22023';
  end if;

  if p_channel not in ('email', 'sms') then
    raise exception 'Unsupported post-call communication channel.'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_recipient, '')) = ''
     or btrim(coalesce(p_body, '')) = '' then
    raise exception 'Recipient and message body are required.'
      using errcode = '22023';
  end if;

  if p_channel = 'email'
     and btrim(coalesce(p_subject, '')) = '' then
    raise exception 'Email subject is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.background_jobs as dispatch_job
    where dispatch_job.id = p_dispatch_job_id
      and dispatch_job.organization_id = p_organization_id
      and dispatch_job.queue = 'post_call'
      and dispatch_job.job_type = 'automation.post_call.dispatch'
  ) then
    raise exception 'The post-call dispatch job is invalid for this organization.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.contacts as contact_record
    where contact_record.id = p_contact_id
      and contact_record.organization_id = p_organization_id
  ) then
    raise exception 'The contact does not belong to this organization.'
      using errcode = '22023';
  end if;

  v_source := case
    when p_channel = 'email' then 'post_call_email'
    else 'post_call_sms'
  end;

  insert into public.communication_messages (
    organization_id,
    contact_id,
    channel,
    direction,
    recipient,
    subject,
    body,
    status,
    source,
    source_record_id
  )
  values (
    p_organization_id,
    p_contact_id,
    p_channel,
    'outbound',
    btrim(p_recipient),
    case
      when p_channel = 'email' then p_subject
      else null
    end,
    p_body,
    'queued',
    v_source,
    p_dispatch_job_id
  )
  on conflict (organization_id, source, source_record_id)
    where source_record_id is not null
  do update
    set updated_at = public.communication_messages.updated_at
  returning * into v_message;

  v_replay := v_message.background_job_id is not null;

  if v_message.background_job_id is not null then
    select *
    into v_job
    from public.background_jobs
    where id = v_message.background_job_id
      and organization_id = p_organization_id;

    if v_job.id is not null then
      return jsonb_build_object(
        'messageId', v_message.id,
        'jobId', v_job.id,
        'status', v_job.status,
        'replay', true
      );
    end if;
  end if;

  v_job_key :=
    'post-call-' || p_channel || ':' || p_dispatch_job_id::text;

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
    'communications',
    'communications.send',
    jsonb_build_object('messageId', v_message.id),
    'queued',
    80,
    now(),
    6,
    v_job_key,
    null
  )
  on conflict (organization_id, idempotency_key)
    where idempotency_key is not null
  do update
    set updated_at = public.background_jobs.updated_at
  returning * into v_job;

  update public.communication_messages
  set
    background_job_id = v_job.id,
    status = case
      when status in ('sent', 'delivered') then status
      else 'queued'
    end,
    error_message = case
      when status in ('sent', 'delivered') then error_message
      else null
    end,
    last_error_code = case
      when status in ('sent', 'delivered') then last_error_code
      else null
    end
  where id = v_message.id
    and organization_id = p_organization_id;

  return jsonb_build_object(
    'messageId', v_message.id,
    'jobId', v_job.id,
    'status', v_job.status,
    'replay', v_replay
  );
end;
$$;

revoke all on function public.enqueue_post_call_communication(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.enqueue_post_call_communication(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text
) to service_role;

comment on function public.enqueue_post_call_communication(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text
) is
  'Transactionally creates one idempotent post-call email or SMS communication and one communications.send job for the same organization and dispatch job.';

commit;
