begin;

-- Repair/refresh the canonical plan-capacity RPC used by server-side quota
-- enforcement. This is intentionally idempotent and matches the Phase 4
-- implementation expected by src/lib/usage-limits.ts.
create or replace function public.organization_plan_capacity_snapshot(
  target_org uuid
)
returns table (
  plan_code text,
  plan_name text,
  subscription_status text,
  members_used bigint,
  members_limit integer,
  contacts_used bigint,
  contacts_limit integer,
  calls_used bigint,
  calls_limit integer,
  storage_used bigint,
  storage_limit bigint,
  phone_numbers_used bigint,
  phone_numbers_limit integer,
  api_keys_used bigint,
  api_keys_limit integer,
  active_campaigns_used bigint,
  active_campaigns_limit integer,
  active_sequences_used bigint,
  active_sequences_limit integer,
  transcription_seconds_used bigint,
  transcription_seconds_limit integer,
  recording_retention_days integer
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_period date := public.usage_period_start();
begin
  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  return query
  with active_plan as (
    select
      plan.*,
      case
        when subscription.status = 'trialing'
          and subscription.trial_ends_at is not null
          and subscription.trial_ends_at <= pg_catalog.now()
          then 'pending'
        else subscription.status
      end as resolved_status
    from public.organization_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
    where subscription.organization_id = target_org
    limit 1
  ), resolved_plan as (
    select * from active_plan
    union all
    select plan.*, 'active'::text as resolved_status
    from public.subscription_plans plan
    where plan.code = 'starter'
      and not exists (select 1 from active_plan)
    limit 1
  )
  select
    plan.code::text,
    plan.name::text,
    plan.resolved_status::text,
    (
      (select count(*)
       from public.organization_members member
       where member.organization_id = target_org
         and member.status = 'active')
      +
      (select count(*)
       from public.organization_invitations invitation
       where invitation.organization_id = target_org
         and invitation.accepted_at is null
         and invitation.revoked_at is null
         and invitation.expires_at > pg_catalog.now())
    )::bigint,
    plan.max_members,
    (select count(*)
     from public.contacts contact
     where contact.organization_id = target_org),
    plan.max_contacts,
    (select count(*)
     from public.calls call_record
     where call_record.organization_id = target_org
       and call_record.created_at >= v_period),
    plan.max_calls_per_month,
    (
      coalesce(
        (select sum(version.size_bytes)
         from public.attachment_versions version
         where version.organization_id = target_org),
        0
      )
      +
      coalesce(
        (select sum(recording.size_bytes)
         from public.recordings recording
         where recording.organization_id = target_org),
        0
      )
    )::bigint,
    plan.max_storage_bytes,
    (select count(*)
     from public.organization_phone_numbers phone_number
     where phone_number.organization_id = target_org),
    plan.max_phone_numbers,
    (select count(*)
     from public.api_keys api_key
     where api_key.organization_id = target_org
       and api_key.revoked_at is null),
    plan.max_api_keys,
    (select count(*)
     from public.campaigns campaign
     where campaign.organization_id = target_org
       and campaign.status = 'active'),
    plan.max_active_campaigns,
    (select count(*)
     from public.sequences sequence_record
     where sequence_record.organization_id = target_org
       and sequence_record.status = 'active'),
    plan.max_active_sequences,
    coalesce(
      (select counter.units
       from public.organization_usage_counters counter
       where counter.organization_id = target_org
         and counter.metric = 'transcription_seconds'
         and counter.period_start = v_period),
      0
    ),
    case
      when plan.max_transcription_minutes_per_month is null
        then null
      else plan.max_transcription_minutes_per_month * 60
    end,
    plan.recording_retention_days
  from resolved_plan plan;
end;
$$;

revoke all
on function public.organization_plan_capacity_snapshot(uuid)
from public;

grant execute
on function public.organization_plan_capacity_snapshot(uuid)
to authenticated, service_role;

comment on function public.organization_plan_capacity_snapshot(uuid) is
  'Canonical server-side capacity snapshot for Flowtix plan quota enforcement. Storage includes all attachment versions and locally stored recordings.';

-- Ask PostgREST to refresh function signatures immediately. This is harmless
-- if the cache is already current and fixes PGRST schema-cache drift after DDL.
notify pgrst, 'reload schema';

commit;
