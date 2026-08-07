-- Flowtix AI / metered usage ambiguity repair
-- Fixes PostgreSQL error:
--   column reference "metric" is ambiguous
--
-- Root cause:
-- consume_organization_usage() RETURNS TABLE exposes an output variable named
-- "metric". The INSERT ... ON CONFLICT (organization_id, metric, period_start)
-- conflict target therefore becomes ambiguous inside PL/pgSQL.
--
-- The fix uses the existing primary-key constraint explicitly instead of
-- referring to the ambiguous metric identifier.
--
-- No usage enforcement is bypassed and no PayMongo billing lifecycle is changed.

begin;

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
begin
  if usage_metric not in ('ai_requests', 'emails', 'sms') then
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
    case usage_metric
      when 'ai_requests' then plan.max_ai_requests_per_month
      when 'emails' then plan.max_emails_per_month
      when 'sms' then plan.max_sms_per_month
    end
  into
    v_status,
    v_grace_end,
    v_limit
  from public.organization_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
  where subscription.organization_id = target_org
  limit 1;

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

notify pgrst, 'reload schema';

commit;
