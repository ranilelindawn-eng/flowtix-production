-- Phase 4.10 — AI usage controls

create table if not exists public.ai_usage_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit >= 0),
  monthly_token_limit bigint check (monthly_token_limit is null or monthly_token_limit >= 0),
  monthly_cost_limit_micros bigint check (monthly_cost_limit_micros is null or monthly_cost_limit_micros >= 0),
  per_user_daily_request_limit integer check (per_user_daily_request_limit is null or per_user_daily_request_limit >= 0),
  max_concurrent_requests integer not null default 10 check (max_concurrent_requests between 1 and 1000),
  allowed_features text[] not null default array[]::text[],
  blocked_features text[] not null default array[]::text[],
  allowed_providers text[] not null default array[]::text[],
  allowed_models text[] not null default array[]::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  idempotency_key text not null,
  status text not null default 'reserved' check (status in ('reserved','completed','failed','cancelled','expired')),
  provider text,
  model text,
  estimated_input_tokens integer not null default 0 check (estimated_input_tokens >= 0),
  estimated_output_tokens integer not null default 0 check (estimated_output_tokens >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  provider_request_id text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists ai_usage_reservations_org_created_idx on public.ai_usage_reservations(organization_id, created_at desc);
create index if not exists ai_usage_reservations_user_created_idx on public.ai_usage_reservations(user_id, created_at desc);
create index if not exists ai_usage_reservations_active_idx on public.ai_usage_reservations(organization_id, status, expires_at) where status = 'reserved';
create index if not exists ai_usage_reservations_feature_idx on public.ai_usage_reservations(organization_id, feature, created_at desc);

alter table public.ai_usage_policies enable row level security;
alter table public.ai_usage_reservations enable row level security;

create policy "Organization members can read AI usage policies" on public.ai_usage_policies
for select to authenticated using (public.is_organization_member(organization_id));

create policy "Organization members can read AI usage reservations" on public.ai_usage_reservations
for select to authenticated using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.ai_usage_policies from anon, authenticated;
revoke insert, update, delete on public.ai_usage_reservations from anon, authenticated;

create or replace function public.reserve_ai_usage(
  target_org uuid,
  usage_feature text,
  usage_idempotency_key text,
  estimated_input integer default 0,
  estimated_output integer default 0,
  reservation_seconds integer default 900
)
returns public.ai_usage_reservations
language plpgsql volatile security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_policy public.ai_usage_policies%rowtype;
  v_existing public.ai_usage_reservations%rowtype;
  v_result public.ai_usage_reservations%rowtype;
  v_daily bigint;
  v_user_daily bigint;
  v_monthly_tokens bigint;
  v_monthly_cost bigint;
  v_concurrent bigint;
begin
  if auth.role() <> 'service_role' and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;
  if nullif(trim(usage_feature), '') is null or nullif(trim(usage_idempotency_key), '') is null then
    raise exception 'INVALID_AI_USAGE_REQUEST' using errcode = '22023';
  end if;

  update public.ai_usage_reservations set status='expired', updated_at=now()
  where organization_id=target_org and status='reserved' and expires_at <= now();

  select * into v_existing from public.ai_usage_reservations
  where organization_id=target_org and idempotency_key=usage_idempotency_key;
  if found then return v_existing; end if;

  insert into public.ai_usage_policies (organization_id) values (target_org)
  on conflict (organization_id) do nothing;
  select * into v_policy from public.ai_usage_policies where organization_id=target_org for update;

  if not v_policy.enabled then raise exception 'AI_USAGE_DISABLED' using errcode='P0001'; end if;
  if cardinality(v_policy.allowed_features) > 0 and not (usage_feature = any(v_policy.allowed_features)) then
    raise exception 'AI_FEATURE_NOT_ALLOWED:%', usage_feature using errcode='P0001';
  end if;
  if usage_feature = any(v_policy.blocked_features) then
    raise exception 'AI_FEATURE_BLOCKED:%', usage_feature using errcode='P0001';
  end if;

  select count(*) into v_daily from public.ai_usage_reservations
  where organization_id=target_org and created_at >= date_trunc('day', now()) and status not in ('cancelled','failed');
  select count(*) into v_user_daily from public.ai_usage_reservations
  where organization_id=target_org and user_id=auth.uid() and created_at >= date_trunc('day', now()) and status not in ('cancelled','failed');
  select coalesce(sum(coalesce(input_tokens,estimated_input_tokens)+coalesce(output_tokens,estimated_output_tokens)),0),
         coalesce(sum(cost_micros),0)
    into v_monthly_tokens, v_monthly_cost
  from public.ai_usage_reservations
  where organization_id=target_org and created_at >= date_trunc('month', now()) and status='completed';
  select count(*) into v_concurrent from public.ai_usage_reservations
  where organization_id=target_org and status='reserved' and expires_at > now();

  if v_policy.daily_request_limit is not null and v_daily >= v_policy.daily_request_limit then raise exception 'AI_DAILY_REQUEST_LIMIT_REACHED' using errcode='P0001'; end if;
  if v_policy.per_user_daily_request_limit is not null and v_user_daily >= v_policy.per_user_daily_request_limit then raise exception 'AI_USER_DAILY_REQUEST_LIMIT_REACHED' using errcode='P0001'; end if;
  if v_policy.monthly_token_limit is not null and v_monthly_tokens + greatest(estimated_input,0) + greatest(estimated_output,0) > v_policy.monthly_token_limit then raise exception 'AI_MONTHLY_TOKEN_LIMIT_REACHED' using errcode='P0001'; end if;
  if v_policy.monthly_cost_limit_micros is not null and v_monthly_cost >= v_policy.monthly_cost_limit_micros then raise exception 'AI_MONTHLY_COST_LIMIT_REACHED' using errcode='P0001'; end if;
  if v_concurrent >= v_policy.max_concurrent_requests then raise exception 'AI_CONCURRENCY_LIMIT_REACHED' using errcode='P0001'; end if;

  perform public.consume_organization_usage(target_org, 'ai_requests', 1, 'ai-control:' || usage_idempotency_key);

  insert into public.ai_usage_reservations(
    organization_id,user_id,feature,idempotency_key,estimated_input_tokens,estimated_output_tokens,expires_at
  ) values (
    target_org, coalesce(auth.uid(), (select created_by from public.organizations where id=target_org)), trim(usage_feature), trim(usage_idempotency_key), greatest(estimated_input,0), greatest(estimated_output,0), now() + make_interval(secs => greatest(60, least(reservation_seconds,3600)))
  ) returning * into v_result;
  return v_result;
end;
$function$;

create or replace function public.finalize_ai_usage(
  reservation_id uuid,
  result_status text,
  result_provider text default null,
  result_model text default null,
  actual_input_tokens integer default null,
  actual_output_tokens integer default null,
  result_cost_micros bigint default null,
  result_request_id text default null,
  result_latency_ms integer default null,
  result_error_code text default null,
  result_error_message text default null,
  result_metadata jsonb default '{}'::jsonb
)
returns public.ai_usage_reservations
language plpgsql volatile security definer
set search_path = public, auth, pg_catalog
as $function$
declare v_row public.ai_usage_reservations%rowtype; v_policy public.ai_usage_policies%rowtype; v_monthly_cost bigint; begin
  select * into v_row from public.ai_usage_reservations where id=reservation_id for update;
  if not found then raise exception 'AI_USAGE_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
  if auth.role() <> 'service_role' and v_row.user_id <> auth.uid() then raise exception 'AI_USAGE_ACCESS_DENIED' using errcode='42501'; end if;
  if v_row.status <> 'reserved' then return v_row; end if;
  if result_status not in ('completed','failed','cancelled') then raise exception 'INVALID_AI_USAGE_STATUS' using errcode='22023'; end if;
  select * into v_policy from public.ai_usage_policies where organization_id=v_row.organization_id;
  if result_provider is not null and cardinality(v_policy.allowed_providers)>0 and not (result_provider = any(v_policy.allowed_providers)) then raise exception 'AI_PROVIDER_NOT_ALLOWED:%',result_provider using errcode='P0001'; end if;
  if result_model is not null and cardinality(v_policy.allowed_models)>0 and not (result_model = any(v_policy.allowed_models)) then raise exception 'AI_MODEL_NOT_ALLOWED:%',result_model using errcode='P0001'; end if;
  if result_status='completed' and v_policy.monthly_cost_limit_micros is not null then
    select coalesce(sum(cost_micros),0) into v_monthly_cost from public.ai_usage_reservations where organization_id=v_row.organization_id and status='completed' and created_at>=date_trunc('month',now());
    if v_monthly_cost + coalesce(result_cost_micros,0) > v_policy.monthly_cost_limit_micros then raise exception 'AI_MONTHLY_COST_LIMIT_REACHED' using errcode='P0001'; end if;
  end if;
  update public.ai_usage_reservations set
    status=result_status, provider=result_provider, model=result_model,
    input_tokens=greatest(actual_input_tokens,0), output_tokens=greatest(actual_output_tokens,0),
    cost_micros=greatest(result_cost_micros,0), provider_request_id=result_request_id,
    latency_ms=greatest(result_latency_ms,0), error_code=result_error_code,
    error_message=left(result_error_message,2000), metadata=coalesce(result_metadata,'{}'::jsonb),
    completed_at=now(), updated_at=now()
  where id=reservation_id returning * into v_row;
  return v_row;
end;
$function$;

create or replace function public.ai_usage_snapshot(target_org uuid)
returns table(
  daily_requests bigint, monthly_requests bigint, monthly_input_tokens bigint,
  monthly_output_tokens bigint, monthly_cost_micros bigint, active_requests bigint,
  daily_request_limit integer, monthly_token_limit bigint, monthly_cost_limit_micros bigint,
  per_user_daily_request_limit integer, max_concurrent_requests integer
)
language sql stable security definer set search_path=public,auth,pg_catalog as $$
  select
    count(*) filter(where r.created_at>=date_trunc('day',now()) and r.status not in ('cancelled','failed')),
    count(*) filter(where r.created_at>=date_trunc('month',now()) and r.status not in ('cancelled','failed')),
    coalesce(sum(r.input_tokens) filter(where r.created_at>=date_trunc('month',now()) and r.status='completed'),0),
    coalesce(sum(r.output_tokens) filter(where r.created_at>=date_trunc('month',now()) and r.status='completed'),0),
    coalesce(sum(r.cost_micros) filter(where r.created_at>=date_trunc('month',now()) and r.status='completed'),0),
    count(*) filter(where r.status='reserved' and r.expires_at>now()),
    p.daily_request_limit,p.monthly_token_limit,p.monthly_cost_limit_micros,p.per_user_daily_request_limit,p.max_concurrent_requests
  from public.ai_usage_policies p left join public.ai_usage_reservations r on r.organization_id=p.organization_id
  where p.organization_id=target_org and (auth.role()='service_role' or public.is_organization_member(target_org))
  group by p.daily_request_limit,p.monthly_token_limit,p.monthly_cost_limit_micros,p.per_user_daily_request_limit,p.max_concurrent_requests;
$$;

revoke all on function public.reserve_ai_usage(uuid,text,text,integer,integer,integer) from public;
revoke all on function public.finalize_ai_usage(uuid,text,text,text,integer,integer,bigint,text,integer,text,text,jsonb) from public;
revoke all on function public.ai_usage_snapshot(uuid) from public;
grant execute on function public.reserve_ai_usage(uuid,text,text,integer,integer,integer) to authenticated, service_role;
grant execute on function public.finalize_ai_usage(uuid,text,text,text,integer,integer,bigint,text,integer,text,text,jsonb) to authenticated, service_role;
grant execute on function public.ai_usage_snapshot(uuid) to authenticated, service_role;
