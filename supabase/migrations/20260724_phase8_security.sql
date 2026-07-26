-- Phase 8: Security hardening
create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  session_fingerprint text not null,
  ip_address inet,
  user_agent text,
  device_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, session_fingerprint)
);
create index if not exists user_sessions_user_seen_idx on public.user_sessions(user_id, last_seen_at desc);

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
alter table public.user_sessions enable row level security;
alter table public.rate_limit_buckets enable row level security;

create policy "members read organization audit logs" on public.audit_logs
for select using (
  organization_id in (select organization_id from public.profiles where id = auth.uid())
);
create policy "users read own sessions" on public.user_sessions
for select using (user_id = auth.uid());
create policy "users update own sessions" on public.user_sessions
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_row public.rate_limit_buckets%rowtype;
begin
  insert into public.rate_limit_buckets(bucket_key, request_count)
  values (p_bucket_key, 1)
  on conflict (bucket_key) do update set
    request_count = case
      when public.rate_limit_buckets.window_started_at < now() - make_interval(secs => p_window_seconds) then 1
      else public.rate_limit_buckets.request_count + 1 end,
    window_started_at = case
      when public.rate_limit_buckets.window_started_at < now() - make_interval(secs => p_window_seconds) then now()
      else public.rate_limit_buckets.window_started_at end,
    updated_at = now()
  returning * into v_row;
  return v_row.request_count <= p_limit;
end; $$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to anon, authenticated, service_role;

create or replace function public.log_audit_event(
  p_action text,
  p_resource_type text default null,
  p_resource_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_address inet default null,
  p_user_agent text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.profiles where id = auth.uid();
  insert into public.audit_logs(organization_id,user_id,action,resource_type,resource_id,metadata,ip_address,user_agent)
  values(v_org,auth.uid(),p_action,p_resource_type,p_resource_id,coalesce(p_metadata,'{}'::jsonb),p_ip_address,p_user_agent)
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.log_audit_event(text,text,text,jsonb,inet,text) to authenticated;
