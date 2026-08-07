begin;

-- -------------------------------------------------------------------
-- Flowtix real 7-day free trial
--
-- The current hosted PayMongo Checkout Session collects the monthly
-- amount immediately. A trial therefore must not create a checkout at
-- signup. This migration adds a real, no-charge trial lifecycle while
-- preserving the existing hardened PayMongo checkout flow for payment
-- after the trial.
-- -------------------------------------------------------------------

alter table public.organization_subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_converted_at timestamptz;

create index if not exists organization_subscriptions_trial_expiry_idx
  on public.organization_subscriptions (trial_ends_at)
  where status = 'trialing' and trial_ends_at is not null;

create or replace function public.start_flowtix_trial(
  p_organization_id uuid,
  p_plan_code text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_plan_code text := lower(nullif(trim(p_plan_code), ''));
  v_started_at timestamptz := now();
  v_ends_at timestamptz := now() + interval '7 days';
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'Organization and actor are required.';
  end if;

  if v_plan_code = 'professional' then
    v_plan_code := 'pro';
  end if;

  if v_plan_code not in ('starter', 'pro', 'business', 'enterprise') then
    raise exception 'The selected Flowtix trial plan is invalid.';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where code = v_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and coalesce(is_public, true) = true
  limit 1;

  if not found then
    raise exception 'The selected Flowtix trial plan is unavailable.';
  end if;

  select *
  into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription record was not found.';
  end if;

  -- Idempotent retry for the same still-active trial.
  if v_subscription.status = 'trialing'
     and v_subscription.trial_started_at is not null
     and v_subscription.trial_ends_at > now()
     and v_subscription.plan_id = v_plan.id then
    return jsonb_build_object(
      'subscription_id', v_subscription.id,
      'plan_id', v_plan.id,
      'plan_code', v_plan.code,
      'trial_started_at', v_subscription.trial_started_at,
      'trial_ends_at', v_subscription.trial_ends_at
    );
  end if;

  -- A workspace only receives one signup trial.
  if v_subscription.trial_started_at is not null then
    raise exception 'This workspace has already used its free trial.';
  end if;

  -- Do not replace an already-paid subscription with a trial.
  if v_subscription.status = 'active'
     and v_subscription.last_payment_status = 'paid'
     and v_subscription.activated_at is not null then
    raise exception 'An active paid subscription cannot start a free trial.';
  end if;

  update public.organization_subscriptions
  set
    plan_id = v_plan.id,
    status = 'trialing',
    billing_provider = 'paymongo',
    paymongo_plan_code = v_plan.code,
    current_period_start = v_started_at,
    current_period_end = v_ends_at,
    cancel_at_period_end = false,
    pending_plan_id = null,
    pending_checkout_expires_at = null,
    paymongo_checkout_id = null,
    paymongo_payment_id = null,
    provider_checkout_id = null,
    provider_payment_id = null,
    checkout_creation_token = null,
    checkout_creation_started_at = null,
    last_payment_status = 'trialing',
    trial_started_at = v_started_at,
    trial_ends_at = v_ends_at,
    trial_converted_at = null,
    billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'trial_started_at', v_started_at,
        'trial_ends_at', v_ends_at,
        'trial_plan_code', v_plan.code,
        'trial_charge_due_today', 0
      ),
    updated_at = now()
  where id = v_subscription.id;

  insert into public.subscription_lifecycle_events (
    organization_id,
    subscription_id,
    event_type,
    source,
    previous_status,
    new_status,
    plan_id,
    actor_user_id,
    metadata
  )
  values (
    p_organization_id,
    v_subscription.id,
    'trial_started',
    'system',
    v_subscription.status,
    'trialing',
    v_plan.id,
    p_actor_user_id,
    jsonb_build_object(
      'trial_started_at', v_started_at,
      'trial_ends_at', v_ends_at,
      'trial_days', 7
    )
  );

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'plan_id', v_plan.id,
    'plan_code', v_plan.code,
    'trial_started_at', v_started_at,
    'trial_ends_at', v_ends_at
  );
end;
$$;

revoke all on function public.start_flowtix_trial(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.start_flowtix_trial(uuid,text,uuid)
  to service_role;


create or replace function public.process_expired_flowtix_trials()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select
      s.id,
      s.organization_id,
      s.plan_id,
      s.status,
      s.trial_started_at,
      s.trial_ends_at
    from public.organization_subscriptions s
    where s.status = 'trialing'
      and s.trial_ends_at is not null
      and s.trial_ends_at <= now()
    for update skip locked
  loop
    update public.organization_subscriptions
    set
      status = 'pending',
      last_payment_status = 'trial_expired',
      cancel_at_period_end = false,
      pending_plan_id = null,
      pending_checkout_expires_at = null,
      checkout_creation_token = null,
      checkout_creation_started_at = null,
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'trial_expired_at', now(),
          'payment_required', true
        ),
      updated_at = now()
    where id = v_row.id
      and status = 'trialing';

    if found then
      v_count := v_count + 1;

      insert into public.subscription_lifecycle_events (
        organization_id,
        subscription_id,
        event_type,
        source,
        previous_status,
        new_status,
        plan_id,
        metadata
      )
      values (
        v_row.organization_id,
        v_row.id,
        'trial_expired',
        'system',
        'trialing',
        'pending',
        v_row.plan_id,
        jsonb_build_object(
          'trial_started_at', v_row.trial_started_at,
          'trial_ends_at', v_row.trial_ends_at
        )
      );
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.process_expired_flowtix_trials()
  from public, anon, authenticated;
grant execute on function public.process_expired_flowtix_trials()
  to service_role;


-- Entitlements stop immediately when the trial timestamp has passed,
-- even if the scheduled expiry worker has not run yet.
create or replace function public.organization_entitlements(target_org uuid)
returns table (
  plan_code text,
  plan_name text,
  subscription_status text,
  entitlements jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if auth.role() <> 'service_role'
     and not exists (
       select 1 from public.organization_members member
       where member.organization_id = target_org
         and member.user_id = auth.uid()
         and member.status = 'active'
     ) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  select
    plan.code::text,
    plan.name::text,
    (
      case
        when subscription.status = 'trialing'
          and subscription.trial_ends_at is not null
          and subscription.trial_ends_at <= now()
          then 'pending'
        else subscription.status
      end
    )::text,
    case
      when subscription.status = 'active' then plan.entitlements
      when subscription.status = 'trialing'
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at > now()
        then plan.entitlements
      when subscription.status = 'past_due'
        and subscription.grace_period_ends_at is not null
        and subscription.grace_period_ends_at > now()
        then plan.entitlements
      else '[]'::jsonb
    end
  from public.organization_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.organization_id = target_org
  limit 1;

  if not found then
    return query
    select plan.code::text, plan.name::text, 'inactive'::text, '[]'::jsonb
    from public.subscription_plans plan
    where plan.code = 'starter' and plan.is_active = true
    limit 1;
  end if;
end;
$$;


create or replace function public.consume_organization_usage(
  target_org uuid,
  usage_metric text,
  usage_units integer default 1,
  usage_idempotency_key text default null
)
returns table (metric text, used bigint, limit_value integer, remaining bigint)
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
  if usage_metric not in ('ai_requests', 'emails', 'sms') then
    raise exception 'INVALID_USAGE_METRIC' using errcode = '22023';
  end if;
  if usage_units <= 0 then
    raise exception 'INVALID_USAGE_UNITS' using errcode = '22023';
  end if;
  if auth.role() <> 'service_role' and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;

  select s.status, s.grace_period_ends_at, s.trial_ends_at,
    case usage_metric
      when 'ai_requests' then p.max_ai_requests_per_month
      when 'emails' then p.max_emails_per_month
      when 'sms' then p.max_sms_per_month
    end
  into v_status, v_grace_end, v_trial_end, v_limit
  from public.organization_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = target_org
  limit 1;

  if v_status = 'trialing'
     and (v_trial_end is null or v_trial_end <= now()) then
    v_status := 'pending';
  end if;

  if not found
     or v_status not in ('active', 'trialing', 'past_due')
     or (v_status = 'past_due' and (v_grace_end is null or v_grace_end <= now())) then
    raise exception 'SUBSCRIPTION_ACCESS_REQUIRED' using errcode = 'P0001';
  end if;

  if usage_idempotency_key is not null then
    select * into v_existing
    from public.organization_usage_events e
    where e.organization_id = target_org
      and e.metric = usage_metric
      and e.idempotency_key = usage_idempotency_key;

    if found then
      select c.units into v_used
      from public.organization_usage_counters c
      where c.organization_id = target_org
        and c.metric = usage_metric
        and c.period_start = v_period;
      return query select usage_metric, coalesce(v_used, 0), v_limit,
        case when v_limit is null then null else greatest(v_limit::bigint - coalesce(v_used, 0), 0) end;
      return;
    end if;
  end if;

  insert into public.organization_usage_counters (organization_id, metric, period_start, units)
  values (target_org, usage_metric, v_period, 0)
  on conflict (organization_id, metric, period_start) do nothing;

  select c.units into v_used
  from public.organization_usage_counters c
  where c.organization_id = target_org
    and c.metric = usage_metric
    and c.period_start = v_period
  for update;

  if v_limit is not null and v_used + usage_units > v_limit then
    raise exception 'USAGE_LIMIT_REACHED:%:%:%', usage_metric, v_used, v_limit using errcode = 'P0001';
  end if;

  insert into public.organization_usage_events (
    organization_id, metric, units, period_start, idempotency_key, created_by
  ) values (
    target_org, usage_metric, usage_units, v_period,
    nullif(trim(usage_idempotency_key), ''), auth.uid()
  )
  on conflict do nothing;

  if not found and usage_idempotency_key is not null then
    select c.units into v_used
    from public.organization_usage_counters c
    where c.organization_id = target_org
      and c.metric = usage_metric
      and c.period_start = v_period;
  else
    update public.organization_usage_counters c
    set units = c.units + usage_units,
        updated_at = now()
    where c.organization_id = target_org
      and c.metric = usage_metric
      and c.period_start = v_period
    returning c.units into v_used;
  end if;

  return query select usage_metric, v_used, v_limit,
    case when v_limit is null then null else greatest(v_limit::bigint - v_used, 0) end;
end;
$$;


create or replace function public.organization_usage_snapshot(target_org uuid)
returns table (
  plan_code text, plan_name text, subscription_status text,
  current_period_end timestamptz, cancel_at_period_end boolean,
  members_used bigint, members_limit integer,
  contacts_used bigint, contacts_limit integer,
  calls_used bigint, calls_limit integer,
  storage_used bigint, storage_limit bigint,
  ai_requests_used bigint, ai_requests_limit integer,
  emails_used bigint, emails_limit integer,
  sms_used bigint, sms_limit integer,
  phone_numbers_used bigint, phone_numbers_limit integer,
  api_keys_used bigint, api_keys_limit integer
)
language plpgsql stable security definer
set search_path = public, auth, storage, pg_catalog
as $$
declare
  v_period date := public.usage_period_start();
begin
  if auth.role() <> 'service_role' and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  with active_plan as (
    select
      p.*,
      case
        when s.status = 'trialing'
          and s.trial_ends_at is not null
          and s.trial_ends_at <= now()
          then 'pending'
        else s.status
      end as status,
      s.current_period_end,
      s.cancel_at_period_end
    from public.organization_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.organization_id = target_org
    limit 1
  ), resolved_plan as (
    select * from active_plan
    union all
    select p.*, 'active'::text, null::timestamptz, false
    from public.subscription_plans p
    where p.code = 'starter'
      and not exists (select 1 from active_plan)
    limit 1
  )
  select
    p.code::text,
    p.name::text,
    p.status::text,
    p.current_period_end,
    p.cancel_at_period_end,
    (
      (select count(*) from public.organization_members m
       where m.organization_id = target_org and m.status = 'active')
      +
      (select count(*) from public.organization_invitations i
       where i.organization_id = target_org
         and i.accepted_at is null
         and i.revoked_at is null
         and i.expires_at > now())
    )::bigint,
    p.max_members,
    (select count(*) from public.contacts c where c.organization_id = target_org),
    p.max_contacts,
    (select count(*) from public.calls c
     where c.organization_id = target_org and c.created_at >= v_period),
    p.max_calls_per_month,
    coalesce((select sum(a.size_bytes) from public.attachments a
              where a.organization_id = target_org), 0)::bigint,
    p.max_storage_bytes,
    coalesce((select c.units from public.organization_usage_counters c
              where c.organization_id = target_org
                and c.metric = 'ai_requests'
                and c.period_start = v_period), 0),
    p.max_ai_requests_per_month,
    coalesce((select c.units from public.organization_usage_counters c
              where c.organization_id = target_org
                and c.metric = 'emails'
                and c.period_start = v_period), 0),
    p.max_emails_per_month,
    coalesce((select c.units from public.organization_usage_counters c
              where c.organization_id = target_org
                and c.metric = 'sms'
                and c.period_start = v_period), 0),
    p.max_sms_per_month,
    (select count(*) from public.organization_phone_numbers n
     where n.organization_id = target_org),
    p.max_phone_numbers,
    (select count(*) from public.api_keys k
     where k.organization_id = target_org and k.revoked_at is null),
    p.max_api_keys
  from resolved_plan p;
end;
$$;


-- Mark a converted trial when a paid webhook changes the subscription to active.
-- We do this with a narrow trigger so the existing hardened PayMongo lifecycle
-- remains untouched.
create or replace function public.mark_flowtix_trial_converted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'active'
     and new.last_payment_status = 'paid'
     and new.trial_started_at is not null
     and new.trial_converted_at is null then
    new.trial_converted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists mark_flowtix_trial_converted_trigger
  on public.organization_subscriptions;

create trigger mark_flowtix_trial_converted_trigger
before update on public.organization_subscriptions
for each row
execute function public.mark_flowtix_trial_converted();


-- Existing Flowtix deployments already use pg_cron for billing maintenance.
-- Schedule a small expiry pass every minute so the persisted status follows
-- the timestamp closely. Authorization functions above also enforce expiry
-- from trial_ends_at immediately, so cron delay cannot extend entitlements.
do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'flowtix-expire-free-trials';

    perform cron.schedule(
      'flowtix-expire-free-trials',
      '* * * * *',
      'select public.process_expired_flowtix_trials();'
    );
  end if;
exception
  when undefined_table or invalid_schema_name then
    null;
end;
$$;

notify pgrst, 'reload schema';

commit;
