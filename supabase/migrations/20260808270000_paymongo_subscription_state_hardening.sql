begin;

create or replace function public.request_subscription_cancellation(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.organization_subscriptions%rowtype;
  actor_role text;
begin
  select member.role into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id
    and coalesce(member.status, 'active') = 'active'
  limit 1;

  if actor_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can cancel the subscription.';
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then raise exception 'Subscription not found.'; end if;

  if subscription_row.status not in ('active', 'trialing', 'past_due') then
    raise exception 'Subscription cannot be cancelled from its current state.';
  end if;

  if subscription_row.cancel_at_period_end then
    return jsonb_build_object(
      'status', subscription_row.status,
      'cancel_at_period_end', true,
      'current_period_end', subscription_row.current_period_end,
      'unchanged', true
    );
  end if;

  if subscription_row.current_period_end is null or subscription_row.current_period_end <= now() then
    raise exception 'A future billing-period end is required before cancellation can be scheduled.';
  end if;

  update public.organization_subscriptions
  set cancel_at_period_end = true,
      scheduled_plan_id = null,
      scheduled_plan_effective_at = null,
      lifecycle_version = coalesce(lifecycle_version, 1) + 1,
      updated_at = now(),
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_requested_at', now(),
        'cancellation_requested_by', p_actor_user_id
      )
  where id = subscription_row.id;

  insert into public.subscription_lifecycle_events (
    organization_id, subscription_id, event_type, source,
    previous_status, new_status, plan_id, actor_user_id, metadata
  ) values (
    p_organization_id, subscription_row.id, 'cancellation_scheduled', 'user',
    subscription_row.status, subscription_row.status, subscription_row.plan_id,
    p_actor_user_id,
    jsonb_build_object('effective_at', subscription_row.current_period_end)
  );

  return jsonb_build_object(
    'status', subscription_row.status,
    'cancel_at_period_end', true,
    'current_period_end', subscription_row.current_period_end
  );
end;
$$;

create or replace function public.reactivate_subscription(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.organization_subscriptions%rowtype;
  actor_role text;
begin
  select member.role into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id
    and coalesce(member.status, 'active') = 'active'
  limit 1;

  if actor_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can reactivate the subscription.';
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then raise exception 'Subscription not found.'; end if;

  if subscription_row.status not in ('active', 'trialing', 'past_due') then
    raise exception 'This subscription cannot be reactivated from its current state.';
  end if;

  if not subscription_row.cancel_at_period_end then
    return jsonb_build_object(
      'status', subscription_row.status,
      'cancel_at_period_end', false,
      'unchanged', true
    );
  end if;

  if subscription_row.current_period_end is not null
     and subscription_row.current_period_end <= now() then
    raise exception 'The cancellation has already taken effect. Complete a new PayMongo checkout to restore service.';
  end if;

  update public.organization_subscriptions
  set cancel_at_period_end = false,
      cancelled_at = null,
      lifecycle_version = coalesce(lifecycle_version, 1) + 1,
      updated_at = now(),
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
        - 'cancellation_requested_at'
        - 'cancellation_requested_by'
  where id = subscription_row.id;

  insert into public.subscription_lifecycle_events (
    organization_id, subscription_id, event_type, source,
    previous_status, new_status, plan_id, actor_user_id
  ) values (
    p_organization_id, subscription_row.id, 'cancellation_revoked', 'user',
    subscription_row.status, subscription_row.status, subscription_row.plan_id,
    p_actor_user_id
  );

  return jsonb_build_object(
    'status', subscription_row.status,
    'cancel_at_period_end', false
  );
end;
$$;

create or replace function public.schedule_subscription_plan_change(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_plan_code text,
  p_effective text default 'period_end'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_role text;
  v_when timestamptz;
begin
  select role into v_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_actor_user_id
    and coalesce(status, 'active') = 'active'
  limit 1;

  if v_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can change plans.';
  end if;

  if lower(coalesce(p_effective, '')) <> 'period_end' then
    raise exception 'Paid plan changes must take effect at the end of the current billing period.';
  end if;

  select * into v_plan
  from public.subscription_plans
  where lower(code) = lower(trim(p_plan_code))
    and is_active = true
    and coalesce(is_public, true) = true
    and billing_provider = 'paymongo'
  limit 1;

  if not found then raise exception 'Plan not found.'; end if;

  select * into v_sub
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then raise exception 'Subscription not found.'; end if;
  if v_sub.status not in ('active', 'trialing') then
    raise exception 'The subscription must be active before a plan change can be scheduled.';
  end if;
  if v_sub.cancel_at_period_end then
    raise exception 'Reactivate the subscription before scheduling a plan change.';
  end if;
  if v_sub.paymongo_checkout_id is not null or v_sub.pending_plan_id is not null then
    raise exception 'Complete or cancel the pending PayMongo checkout first.';
  end if;
  if v_sub.plan_id = v_plan.id then
    raise exception 'The subscription already uses this plan.';
  end if;
  if v_sub.current_period_end is null or v_sub.current_period_end <= now() then
    raise exception 'A future billing-period end is required before a plan change can be scheduled.';
  end if;

  v_when := v_sub.current_period_end;

  update public.organization_subscriptions
  set scheduled_plan_id = v_plan.id,
      scheduled_plan_effective_at = v_when,
      lifecycle_version = coalesce(lifecycle_version, 1) + 1,
      updated_at = now()
  where id = v_sub.id;

  insert into public.subscription_lifecycle_events (
    organization_id, subscription_id, event_type, source,
    previous_status, new_status, plan_id, actor_user_id, metadata
  ) values (
    p_organization_id, v_sub.id, 'plan_change_scheduled', 'user',
    v_sub.status, v_sub.status, v_plan.id, p_actor_user_id,
    jsonb_build_object(
      'effective', 'period_end',
      'effective_at', v_when,
      'previous_plan_id', v_sub.plan_id,
      'requires_paymongo_payment', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'effective', 'period_end',
    'effective_at', v_when,
    'plan_code', v_plan.code,
    'requires_paymongo_payment', true
  );
end;
$$;

create or replace function public.process_subscription_renewals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r public.organization_subscriptions%rowtype;
begin
  for r in
    select *
    from public.organization_subscriptions
    where current_period_end is not null
      and current_period_end <= now()
      and status in ('active', 'trialing', 'past_due')
      and (next_renewal_attempt_at is null or next_renewal_attempt_at <= now())
    for update skip locked
  loop
    if r.cancel_at_period_end then
      update public.organization_subscriptions
      set status = 'cancelled',
          cancelled_at = coalesce(cancelled_at, now()),
          cancel_at_period_end = false,
          scheduled_plan_id = null,
          scheduled_plan_effective_at = null,
          pending_plan_id = null,
          pending_checkout_expires_at = null,
          paymongo_checkout_id = null,
          provider_checkout_id = null,
          next_renewal_attempt_at = null,
          lifecycle_version = coalesce(lifecycle_version, 1) + 1,
          updated_at = now()
      where id = r.id;

      insert into public.subscription_lifecycle_events (
        organization_id, subscription_id, event_type, source,
        previous_status, new_status, plan_id, metadata
      ) values (
        r.organization_id, r.id, 'subscription_cancelled', 'system',
        r.status, 'cancelled', r.plan_id,
        jsonb_build_object('effective_at', r.current_period_end)
      );
    else
      update public.organization_subscriptions
      set status = 'past_due',
          grace_period_ends_at = coalesce(grace_period_ends_at, now() + interval '7 days'),
          renewal_attempt_count = coalesce(renewal_attempt_count, 0) + 1,
          next_renewal_attempt_at = now() + interval '24 hours',
          lifecycle_version = coalesce(lifecycle_version, 1) + 1,
          updated_at = now()
      where id = r.id;

      insert into public.subscription_lifecycle_events (
        organization_id, subscription_id, event_type, source,
        previous_status, new_status, plan_id, metadata
      ) values (
        r.organization_id, r.id, 'renewal_payment_required', 'system',
        r.status, 'past_due', r.plan_id,
        jsonb_build_object(
          'period_end', r.current_period_end,
          'grace_period_days', 7,
          'scheduled_plan_id', r.scheduled_plan_id
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

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
    subscription.status::text,
    case
      when subscription.status in ('active', 'trialing') then plan.entitlements
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

  select s.status, s.grace_period_ends_at,
    case usage_metric
      when 'ai_requests' then p.max_ai_requests_per_month
      when 'emails' then p.max_emails_per_month
      when 'sms' then p.max_sms_per_month
    end
  into v_status, v_grace_end, v_limit
  from public.organization_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = target_org
  limit 1;

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

revoke all on function public.request_subscription_cancellation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reactivate_subscription(uuid, uuid) from public, anon, authenticated;
revoke all on function public.schedule_subscription_plan_change(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.process_subscription_renewals() from public, anon, authenticated;
revoke all on function public.organization_entitlements(uuid) from public;
revoke all on function public.consume_organization_usage(uuid, text, integer, text) from public;

grant execute on function public.request_subscription_cancellation(uuid, uuid) to service_role;
grant execute on function public.reactivate_subscription(uuid, uuid) to service_role;
grant execute on function public.schedule_subscription_plan_change(uuid, uuid, text, text) to service_role;
grant execute on function public.process_subscription_renewals() to service_role;
grant execute on function public.organization_entitlements(uuid) to authenticated, service_role;
grant execute on function public.consume_organization_usage(uuid, text, integer, text) to authenticated, service_role;

create index if not exists organization_subscriptions_state_processing_idx
  on public.organization_subscriptions (status, current_period_end, next_renewal_attempt_at)
  where status in ('active', 'trialing', 'past_due');

create index if not exists organization_subscriptions_scheduled_plan_idx
  on public.organization_subscriptions (scheduled_plan_effective_at)
  where scheduled_plan_id is not null;

comment on function public.schedule_subscription_plan_change(uuid, uuid, text, text)
  is 'Schedules a PayMongo plan change for period end only; it never grants unpaid immediate plan access.';
comment on function public.process_subscription_renewals()
  is 'Applies scheduled cancellations and moves unpaid renewals into a guarded past-due grace period.';

commit;
