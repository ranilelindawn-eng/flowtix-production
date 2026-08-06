begin;

-- Phase D.1: harden SECURITY DEFINER RPC authorization boundaries.
-- These functions bypass RLS by design, so every authenticated entry point must
-- independently validate tenant membership or be service-role only.

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
    raise exception 'organization_required' using errcode = '22023';
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
    min(coalesce(job.next_retry_at, job.scheduled_at)) filter (
      where job.status in ('queued', 'scheduled', 'processing', 'retrying')
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
end;
$$;

revoke all on function public.get_automation_queue_health(uuid)
from public, anon;
grant execute on function public.get_automation_queue_health(uuid)
to authenticated, service_role;

create or replace function public.organization_plan_limits(target_org uuid)
returns table (
  plan_code text,
  plan_name text,
  max_members integer,
  max_contacts integer,
  max_storage_bytes bigint,
  max_calls_per_month integer,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if target_org is null then
    raise exception 'organization_required' using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org)
  then
    raise exception 'Not authorized to view organization plan limits.'
      using errcode = '42501';
  end if;

  return query
  select
    plan.code,
    plan.name,
    plan.max_members,
    plan.max_contacts,
    plan.max_storage_bytes,
    plan.max_calls_per_month,
    subscription.status,
    subscription.current_period_end,
    subscription.cancel_at_period_end
  from public.organization_subscriptions as subscription
  join public.subscription_plans as plan
    on plan.id = subscription.plan_id
  where subscription.organization_id = target_org
  limit 1;
end;
$$;

revoke all on function public.organization_plan_limits(uuid)
from public, anon;
grant execute on function public.organization_plan_limits(uuid)
to authenticated, service_role;

create or replace function public.organization_usage(target_org uuid)
returns table (
  members_count bigint,
  pending_invitations_count bigint,
  contacts_count bigint,
  calls_this_month bigint,
  storage_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public, storage, pg_catalog
as $$
begin
  if target_org is null then
    raise exception 'organization_required' using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org)
  then
    raise exception 'Not authorized to view organization usage.'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.organization_members as member
      where member.organization_id = target_org
        and member.status = 'active'),
    (select count(*) from public.organization_invitations as invitation
      where invitation.organization_id = target_org
        and invitation.accepted_at is null
        and invitation.revoked_at is null
        and invitation.expires_at > now()),
    (select count(*) from public.contacts as contact
      where contact.organization_id = target_org),
    (select count(*) from public.calls as call
      where call.organization_id = target_org
        and call.created_at >= date_trunc('month', now())),
    coalesce((select sum(attachment.size_bytes)
      from public.attachments as attachment
      where attachment.organization_id = target_org), 0)::bigint;
end;
$$;

revoke all on function public.organization_usage(uuid)
from public, anon;
grant execute on function public.organization_usage(uuid)
to authenticated, service_role;

-- Completion RPCs are called exclusively through the server-side admin client.
-- Authenticated users must not be able to mutate an idempotency record by UUID.
revoke all on function public.complete_idempotent_request(
  uuid, integer, jsonb, text, text
) from public, anon, authenticated;
revoke all on function public.fail_idempotent_request(
  uuid, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_idempotent_request(
  uuid, integer, jsonb, text, text
) to service_role;
grant execute on function public.fail_idempotent_request(
  uuid, integer, text, jsonb
) to service_role;

-- Snapshot collection writes monitoring and alert records using elevated access.
-- Application code already invokes it through the telephony admin client.
revoke all on function public.collect_telephony_monitoring_snapshot(uuid)
from public, anon, authenticated;
grant execute on function public.collect_telephony_monitoring_snapshot(uuid)
to service_role;

commit;
