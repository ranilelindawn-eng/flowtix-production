-- Flowtix Platform Admin — AI Provider Management
--
-- Provider credentials and models remain environment-configured by the existing
-- Flowtix AI abstraction. This migration adds only cross-tenant usage metrics,
-- provider verification history, and platform audit records.

begin;

create table if not exists public.platform_ai_health_checks (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('openai','anthropic','google','openai-compatible')),
  status text not null check (status in ('success','failed')),
  model text,
  latency_ms integer,
  message text not null,
  platform_user_id uuid references public.platform_users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role public.platform_role,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists platform_ai_health_checks_provider_created_idx
  on public.platform_ai_health_checks(provider, created_at desc);

alter table public.platform_ai_health_checks enable row level security;
revoke all on table public.platform_ai_health_checks from public, anon, authenticated;
grant all on table public.platform_ai_health_checks to service_role;

create or replace function public.platform_can_manage_ai()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.platform_users platform_user
      where platform_user.user_id = auth.uid()
        and platform_user.is_active = true
        and platform_user.role in ('platform_owner','platform_admin','developer')
    );
$function$;

create or replace function public.platform_ai_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_manage_ai() then
    raise exception 'PLATFORM_AI_ACCESS_DENIED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'requestsThisMonth',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())),
    'completedThisMonth',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'failedThisMonth',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'failed'),
    'inputTokensThisMonth',
      (select coalesce(sum(usage.input_tokens), 0) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'outputTokensThisMonth',
      (select coalesce(sum(usage.output_tokens), 0) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'costMicrosThisMonth',
      (select coalesce(sum(usage.cost_micros), 0) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'organizationsUsingAIThisMonth',
      (select count(distinct usage.organization_id) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())),
    'requestsLast24Hours',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= pg_catalog.now() - interval '24 hours'),
    'failuresLast24Hours',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= pg_catalog.now() - interval '24 hours'
         and usage.status = 'failed'),
    'averageLatencyMsLast24Hours',
      (select coalesce(round(avg(usage.latency_ms)), 0) from public.ai_usage_reservations usage
       where usage.created_at >= pg_catalog.now() - interval '24 hours'
         and usage.status = 'completed'
         and usage.latency_ms is not null)
  ) into result;

  return result;
end;
$function$;

create or replace function public.platform_ai_health_history(
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
  safe_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if not public.platform_can_manage_ai() then
    raise exception 'PLATFORM_AI_ACCESS_DENIED' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(health_json),
    '[]'::jsonb
  )
  into result
  from (
    select jsonb_build_object(
      'id', health.id,
      'provider', health.provider,
      'status', health.status,
      'model', health.model,
      'latencyMs', health.latency_ms,
      'message', health.message,
      'actorUserId', health.actor_user_id,
      'actorRole', health.actor_role::text,
      'createdAt', health.created_at
    ) as health_json
    from public.platform_ai_health_checks health
    order by health.created_at desc
    limit safe_limit
  ) recent_health;

  return result;
end;
$function$;

create or replace function public.platform_record_ai_health_check(
  p_provider text,
  p_success boolean,
  p_model text,
  p_latency_ms integer,
  p_message text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  normalized_provider text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider, '')));
  normalized_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner','platform_admin','developer')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_AI_ACCESS_DENIED' using errcode = '42501';
  end if;

  if normalized_provider not in ('openai','anthropic','google','openai-compatible') then
    raise exception 'INVALID_AI_PROVIDER' using errcode = '22023';
  end if;

  if normalized_message is null then
    normalized_message := case
      when p_success then 'AI provider verification succeeded.'
      else 'AI provider verification failed.'
    end;
  end if;

  insert into public.platform_ai_health_checks (
    provider,
    status,
    model,
    latency_ms,
    message,
    platform_user_id,
    actor_user_id,
    actor_role
  ) values (
    normalized_provider,
    case when p_success then 'success' else 'failed' end,
    nullif(pg_catalog.btrim(coalesce(p_model, '')), ''),
    p_latency_ms,
    normalized_message,
    actor.id,
    actor.user_id,
    actor.role
  );

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  ) values (
    actor.id,
    actor.user_id,
    actor.role,
    case
      when p_success then 'ai.provider_verification_succeeded'
      else 'ai.provider_verification_failed'
    end,
    'ai_provider',
    normalized_provider,
    normalized_message,
    null,
    jsonb_build_object(
      'status', case when p_success then 'success' else 'failed' end,
      'model', nullif(pg_catalog.btrim(coalesce(p_model, '')), ''),
      'latencyMs', p_latency_ms
    ),
    jsonb_build_object('credentialsExposed', false)
  );

  return true;
end;
$function$;

revoke all on function public.platform_can_manage_ai() from public, anon;
revoke all on function public.platform_ai_metrics() from public, anon;
revoke all on function public.platform_ai_health_history(integer) from public, anon;
revoke all on function public.platform_record_ai_health_check(text,boolean,text,integer,text) from public, anon;

grant execute on function public.platform_can_manage_ai() to authenticated;
grant execute on function public.platform_ai_metrics() to authenticated;
grant execute on function public.platform_ai_health_history(integer) to authenticated;
grant execute on function public.platform_record_ai_health_check(text,boolean,text,integer,text) to authenticated;

notify pgrst, 'reload schema';

commit;
