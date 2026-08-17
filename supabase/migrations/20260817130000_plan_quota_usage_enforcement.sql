begin;

-- -------------------------------------------------------------------
-- Flowtix Phase 4 — canonical plan quota / usage enforcement
--
-- Extends the existing usage framework without replacing it:
--   * active campaign + active sequence capacity snapshots
--   * accurate tenant storage capacity (all attachment versions + uploads)
--   * monthly transcription seconds in the existing idempotent usage ledger
--   * plan recording-retention policy surfaced to application guards
--   * invitation acceptance re-check after a downgrade
--
-- This migration does not delete customer data and does not change billing,
-- PayMongo amounts, telephony provider configuration, or plan entitlements.
-- -------------------------------------------------------------------

-- The existing usage ledger was originally limited to AI requests, email,
-- and SMS. Transcription minutes use the same audited/idempotent ledger,
-- represented as seconds so partial minutes are accounted for accurately.
alter table public.organization_usage_counters
  drop constraint if exists organization_usage_counters_metric_check;

alter table public.organization_usage_counters
  add constraint organization_usage_counters_metric_check
  check (
    metric in (
      'ai_requests',
      'emails',
      'sms',
      'transcription_seconds'
    )
  );

alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_metric_check;

alter table public.organization_usage_events
  add constraint organization_usage_events_metric_check
  check (
    metric in (
      'ai_requests',
      'emails',
      'sms',
      'transcription_seconds'
    )
  );

-- Preserve the latest hardened subscription/trial/idempotency behavior while
-- adding transcription_seconds as one additional metered metric.
create or replace function public.consume_organization_usage(
  target_org uuid,
  usage_metric text,
  usage_units integer default 1,
  usage_idempotency_key text default null
)
returns table (
  metric text,
  used bigint,
  limit_value integer,
  remaining bigint
)
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_period date := public.usage_period_start();
  v_limit integer;
  v_used bigint;
  v_existing public.organization_usage_events%rowtype;
  v_status text;
  v_grace_end timestamptz;
  v_trial_end timestamptz;
begin
  if usage_metric not in (
    'ai_requests',
    'emails',
    'sms',
    'transcription_seconds'
  ) then
    raise exception 'INVALID_USAGE_METRIC'
      using errcode = '22023';
  end if;

  if usage_units <= 0 then
    raise exception 'INVALID_USAGE_UNITS'
      using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select
    subscription.status,
    subscription.grace_period_ends_at,
    subscription.trial_ends_at,
    case usage_metric
      when 'ai_requests' then plan.max_ai_requests_per_month
      when 'emails' then plan.max_emails_per_month
      when 'sms' then plan.max_sms_per_month
      when 'transcription_seconds' then
        case
          when plan.max_transcription_minutes_per_month is null
            then null
          else plan.max_transcription_minutes_per_month * 60
        end
    end
  into
    v_status,
    v_grace_end,
    v_trial_end,
    v_limit
  from public.organization_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
  where subscription.organization_id = target_org
  limit 1;

  if v_status = 'trialing'
     and (
       v_trial_end is null
       or v_trial_end <= pg_catalog.now()
     ) then
    v_status := 'pending';
  end if;

  if not found
     or v_status not in ('active', 'trialing', 'past_due')
     or (
       v_status = 'past_due'
       and (
         v_grace_end is null
         or v_grace_end <= pg_catalog.now()
       )
     ) then
    raise exception 'SUBSCRIPTION_ACCESS_REQUIRED'
      using errcode = 'P0001';
  end if;

  if usage_idempotency_key is not null then
    select usage_event.*
    into v_existing
    from public.organization_usage_events usage_event
    where usage_event.organization_id = target_org
      and usage_event.metric = usage_metric
      and usage_event.idempotency_key = usage_idempotency_key;

    if found then
      select counter.units
      into v_used
      from public.organization_usage_counters counter
      where counter.organization_id = target_org
        and counter.metric = usage_metric
        and counter.period_start = v_period;

      return query
      select
        usage_metric,
        coalesce(v_used, 0),
        v_limit,
        case
          when v_limit is null then null
          else greatest(
            v_limit::bigint - coalesce(v_used, 0),
            0
          )
        end;

      return;
    end if;
  end if;

  insert into public.organization_usage_counters (
    organization_id,
    metric,
    period_start,
    units
  )
  values (
    target_org,
    usage_metric,
    v_period,
    0
  )
  on conflict on constraint organization_usage_counters_pkey
  do nothing;

  select counter.units
  into v_used
  from public.organization_usage_counters counter
  where counter.organization_id = target_org
    and counter.metric = usage_metric
    and counter.period_start = v_period
  for update;

  if v_limit is not null
     and v_used + usage_units > v_limit then
    raise exception
      'USAGE_LIMIT_REACHED:%:%:%',
      usage_metric,
      v_used,
      v_limit
      using errcode = 'P0001';
  end if;

  insert into public.organization_usage_events (
    organization_id,
    metric,
    units,
    period_start,
    idempotency_key,
    created_by
  )
  values (
    target_org,
    usage_metric,
    usage_units,
    v_period,
    nullif(pg_catalog.btrim(usage_idempotency_key), ''),
    auth.uid()
  )
  on conflict do nothing;

  if not found
     and usage_idempotency_key is not null then
    select counter.units
    into v_used
    from public.organization_usage_counters counter
    where counter.organization_id = target_org
      and counter.metric = usage_metric
      and counter.period_start = v_period;
  else
    update public.organization_usage_counters counter
    set
      units = counter.units + usage_units,
      updated_at = pg_catalog.now()
    where counter.organization_id = target_org
      and counter.metric = usage_metric
      and counter.period_start = v_period
    returning counter.units
    into v_used;
  end if;

  return query
  select
    usage_metric,
    v_used,
    v_limit,
    case
      when v_limit is null then null
      else greatest(v_limit::bigint - v_used, 0)
    end;
end;
$$;

revoke all
on function public.consume_organization_usage(
  uuid,
  text,
  integer,
  text
)
from public;

grant execute
on function public.consume_organization_usage(
  uuid,
  text,
  integer,
  text
)
to authenticated, service_role;

-- Dedicated capacity snapshot for plan enforcement. The older
-- organization_usage_snapshot() remains unchanged for compatibility with the
-- existing billing UI. This function is used by server-side write guards.
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

-- Re-check the member limit when an invitation is accepted. Pending
-- invitations already reserve member capacity in the application snapshot;
-- this additional check prevents a stale invitation from exceeding a lower
-- plan limit after an organization has downgraded.
create or replace function public.accept_organization_invitation(
  invitation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  invitation_record public.organization_invitations%rowtype;
  signed_in_email text;
  signed_in_name text;
  member_limit integer;
  resulting_reserved_members bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    lower(account.email),
    coalesce(
      nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'full_name'), ''),
      split_part(account.email, '@', 1)
    )
  into signed_in_email, signed_in_name
  from auth.users as account
  where account.id = auth.uid();

  if signed_in_email is null then
    raise exception 'Authenticated user email not found';
  end if;

  select invitation.*
  into invitation_record
  from public.organization_invitations as invitation
  where invitation.token = invitation_token
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation unavailable';
  end if;

  if invitation_record.accepted_at is not null then
    raise exception 'Invitation already accepted';
  end if;

  if invitation_record.revoked_at is not null then
    raise exception 'Invitation revoked';
  end if;

  if invitation_record.expires_at <= pg_catalog.now() then
    update public.organization_invitations
    set
      revoked_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = invitation_record.id;

    raise exception 'Invitation expired';
  end if;

  if lower(invitation_record.email) <> signed_in_email then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  select plan.max_members
  into member_limit
  from public.organization_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
  where subscription.organization_id = invitation_record.organization_id
  limit 1;

  if not found then
    select plan.max_members
    into member_limit
    from public.subscription_plans plan
    where plan.code = 'starter'
    limit 1;
  end if;

  if member_limit is not null then
    select
      (
        select count(*)
        from public.organization_members member
        where member.organization_id = invitation_record.organization_id
          and member.status = 'active'
          and member.user_id <> auth.uid()
      )
      + 1
      +
      (
        select count(*)
        from public.organization_invitations invitation
        where invitation.organization_id = invitation_record.organization_id
          and invitation.id <> invitation_record.id
          and invitation.accepted_at is null
          and invitation.revoked_at is null
          and invitation.expires_at > pg_catalog.now()
      )
    into resulting_reserved_members;

    if resulting_reserved_members > member_limit then
      raise exception
        'USAGE_LIMIT_REACHED:members:%:%',
        resulting_reserved_members - 1,
        member_limit
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    organization_id,
    created_by,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    signed_in_email,
    signed_in_name,
    invitation_record.organization_id,
    auth.uid(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    organization_id = excluded.organization_id,
    created_by = coalesce(public.profiles.created_by, excluded.created_by),
    updated_at = pg_catalog.now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    invitation_record.organization_id,
    auth.uid(),
    invitation_record.role,
    'active',
    invitation_record.invited_by,
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    status = 'active',
    created_by = coalesce(
      public.organization_members.created_by,
      excluded.created_by
    ),
    updated_at = pg_catalog.now();

  update public.organization_invitations
  set
    accepted_by = auth.uid(),
    accepted_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where id = invitation_record.id
    and accepted_at is null
    and revoked_at is null;

  if not found then
    raise exception 'Invitation was already processed';
  end if;

  return true;
end;
$$;

revoke all
on function public.accept_organization_invitation(uuid)
from public;

grant execute
on function public.accept_organization_invitation(uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
