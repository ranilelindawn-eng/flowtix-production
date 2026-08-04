begin;

alter table public.subscription_plans
  add column if not exists max_ai_requests_per_month integer,
  add column if not exists max_emails_per_month integer,
  add column if not exists max_sms_per_month integer,
  add column if not exists max_phone_numbers integer,
  add column if not exists max_api_keys integer;

update public.subscription_plans
set
  max_ai_requests_per_month = case code
    when 'free' then 0 when 'starter' then 0 when 'pro' then 1000
    when 'business' then 5000 when 'enterprise' then null else max_ai_requests_per_month end,
  max_emails_per_month = case code
    when 'free' then 100 when 'starter' then 500 when 'pro' then 5000
    when 'business' then 25000 when 'enterprise' then null else max_emails_per_month end,
  max_sms_per_month = case code
    when 'free' then 0 when 'starter' then 0 when 'pro' then 1000
    when 'business' then 10000 when 'enterprise' then null else max_sms_per_month end,
  max_phone_numbers = case code
    when 'free' then 0 when 'starter' then 1 when 'pro' then 5
    when 'business' then 25 when 'enterprise' then null else max_phone_numbers end,
  max_api_keys = case code
    when 'free' then 0 when 'starter' then 0 when 'pro' then 0
    when 'business' then 10 when 'enterprise' then null else max_api_keys end,
  updated_at = now();

create table if not exists public.organization_usage_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null check (metric in ('ai_requests','emails','sms')),
  period_start date not null,
  units bigint not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, metric, period_start)
);

create table if not exists public.organization_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null check (metric in ('ai_requests','emails','sms')),
  units integer not null check (units > 0),
  period_start date not null,
  idempotency_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_usage_events_idempotency_idx
  on public.organization_usage_events (organization_id, metric, idempotency_key)
  where idempotency_key is not null;
create index if not exists organization_usage_events_org_period_idx
  on public.organization_usage_events (organization_id, period_start, metric);

alter table public.organization_usage_counters enable row level security;
alter table public.organization_usage_events enable row level security;

drop policy if exists usage_counters_read_members on public.organization_usage_counters;
create policy usage_counters_read_members on public.organization_usage_counters
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists usage_events_read_admins on public.organization_usage_events;
create policy usage_events_read_admins on public.organization_usage_events
for select to authenticated
using (public.organization_role(organization_id) in ('owner','admin'));

create or replace function public.usage_period_start()
returns date language sql stable set search_path = pg_catalog
as $$ select date_trunc('month', now())::date $$;

create or replace function public.consume_organization_usage(
  target_org uuid,
  usage_metric text,
  usage_units integer default 1,
  usage_idempotency_key text default null
)
returns table (metric text, used bigint, limit_value integer, remaining bigint)
language plpgsql volatile security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_period date := public.usage_period_start();
  v_limit integer;
  v_used bigint;
  v_existing public.organization_usage_events%rowtype;
begin
  if usage_metric not in ('ai_requests','emails','sms') then
    raise exception 'INVALID_USAGE_METRIC' using errcode = '22023';
  end if;
  if usage_units <= 0 then
    raise exception 'INVALID_USAGE_UNITS' using errcode = '22023';
  end if;
  if auth.role() <> 'service_role' and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;

  if usage_idempotency_key is not null then
    select * into v_existing from public.organization_usage_events e
    where e.organization_id = target_org and e.metric = usage_metric
      and e.idempotency_key = usage_idempotency_key;
    if found then
      select c.units into v_used from public.organization_usage_counters c
      where c.organization_id = target_org and c.metric = usage_metric and c.period_start = v_period;
      return query select usage_metric, coalesce(v_used, 0), null::integer, null::bigint;
      return;
    end if;
  end if;

  select case usage_metric
    when 'ai_requests' then p.max_ai_requests_per_month
    when 'emails' then p.max_emails_per_month
    when 'sms' then p.max_sms_per_month
  end into v_limit
  from public.organization_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = target_org
  limit 1;

  if not found then
    select case usage_metric
      when 'ai_requests' then p.max_ai_requests_per_month
      when 'emails' then p.max_emails_per_month
      when 'sms' then p.max_sms_per_month
    end into v_limit
    from public.subscription_plans p where p.code = 'starter' limit 1;
  end if;

  insert into public.organization_usage_counters (organization_id, metric, period_start, units)
  values (target_org, usage_metric, v_period, 0)
  on conflict (organization_id, metric, period_start) do nothing;

  select c.units into v_used from public.organization_usage_counters c
  where c.organization_id = target_org and c.metric = usage_metric and c.period_start = v_period
  for update;

  if v_limit is not null and v_used + usage_units > v_limit then
    raise exception 'USAGE_LIMIT_REACHED:%:%:%', usage_metric, v_used, v_limit using errcode = 'P0001';
  end if;

  update public.organization_usage_counters c
  set units = c.units + usage_units, updated_at = now()
  where c.organization_id = target_org and c.metric = usage_metric and c.period_start = v_period
  returning c.units into v_used;

  insert into public.organization_usage_events
    (organization_id, metric, units, period_start, idempotency_key, created_by)
  values (target_org, usage_metric, usage_units, v_period, nullif(usage_idempotency_key, ''), auth.uid())
  on conflict do nothing;

  return query select usage_metric, v_used, v_limit,
    case when v_limit is null then null else greatest(v_limit::bigint - v_used, 0) end;
end;
$function$;

revoke all on function public.consume_organization_usage(uuid,text,integer,text) from public;
grant execute on function public.consume_organization_usage(uuid,text,integer,text) to authenticated, service_role;

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
as $function$
declare v_period date := public.usage_period_start();
begin
  if auth.role() <> 'service_role' and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  with active_plan as (
    select p.*, s.status, s.current_period_end, s.cancel_at_period_end
    from public.organization_subscriptions s join public.subscription_plans p on p.id = s.plan_id
    where s.organization_id = target_org limit 1
  ), resolved_plan as (
    select * from active_plan
    union all
    select p.*, 'active'::text, null::timestamptz, false
    from public.subscription_plans p where p.code = 'starter' and not exists (select 1 from active_plan)
    limit 1
  )
  select
    p.code::text, p.name::text, p.status::text, p.current_period_end, p.cancel_at_period_end,
    ((select count(*) from public.organization_members m where m.organization_id=target_org and m.status='active') +
     (select count(*) from public.organization_invitations i where i.organization_id=target_org and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()))::bigint,
    p.max_members,
    (select count(*) from public.contacts c where c.organization_id=target_org), p.max_contacts,
    (select count(*) from public.calls c where c.organization_id=target_org and c.created_at>=v_period), p.max_calls_per_month,
    coalesce((select sum(a.size_bytes) from public.attachments a where a.organization_id=target_org),0)::bigint, p.max_storage_bytes,
    coalesce((select c.units from public.organization_usage_counters c where c.organization_id=target_org and c.metric='ai_requests' and c.period_start=v_period),0), p.max_ai_requests_per_month,
    coalesce((select c.units from public.organization_usage_counters c where c.organization_id=target_org and c.metric='emails' and c.period_start=v_period),0), p.max_emails_per_month,
    coalesce((select c.units from public.organization_usage_counters c where c.organization_id=target_org and c.metric='sms' and c.period_start=v_period),0), p.max_sms_per_month,
    (select count(*) from public.organization_phone_numbers n where n.organization_id=target_org), p.max_phone_numbers,
    (select count(*) from public.api_keys k where k.organization_id=target_org and k.revoked_at is null), p.max_api_keys
  from resolved_plan p;
end;
$function$;

revoke all on function public.organization_usage_snapshot(uuid) from public;
grant execute on function public.organization_usage_snapshot(uuid) to authenticated, service_role;

comment on table public.organization_usage_counters is 'Atomic monthly metered usage totals used for plan enforcement.';
comment on table public.organization_usage_events is 'Idempotent usage-consumption ledger for billable or limited operations.';

commit;
