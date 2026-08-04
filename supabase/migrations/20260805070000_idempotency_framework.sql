-- Phase 1.7: centralized idempotency framework for provider-facing mutations.

create table if not exists public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id text,
  error_message text,
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope, idempotency_key)
);

create index if not exists idempotency_records_lookup_idx
  on public.idempotency_records (organization_id, scope, idempotency_key);

create index if not exists idempotency_records_cleanup_idx
  on public.idempotency_records (expires_at, status);

alter table public.idempotency_records enable row level security;

revoke all on public.idempotency_records from anon, authenticated;
grant select on public.idempotency_records to authenticated;
grant all on public.idempotency_records to service_role;

drop policy if exists idempotency_records_admin_read on public.idempotency_records;
create policy idempotency_records_admin_read
on public.idempotency_records
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = idempotency_records.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status::text, 'active') = 'active'
      and member.role::text in ('owner', 'admin')
  )
);

create or replace function public.begin_idempotent_request(
  target_org uuid,
  operation_scope text,
  operation_key text,
  request_fingerprint text,
  ttl_seconds integer default 86400
)
returns table (
  action text,
  record_id uuid,
  response_status integer,
  response_body jsonb
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  normalized_scope text := btrim(coalesce(operation_scope, ''));
  normalized_key text := btrim(coalesce(operation_key, ''));
  normalized_hash text := btrim(coalesce(request_fingerprint, ''));
  inserted_count integer := 0;
  existing public.idempotency_records%rowtype;
  caller uuid := auth.uid();
begin
  if target_org is null or normalized_scope = '' or normalized_key = '' or normalized_hash = '' then
    raise exception 'INVALID_IDEMPOTENCY_REQUEST';
  end if;

  if caller is not null and not exists (
    select 1 from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = caller
      and coalesce(member.status::text, 'active') = 'active'
  ) then
    raise exception 'IDEMPOTENCY_ORGANIZATION_ACCESS_DENIED';
  end if;

  insert into public.idempotency_records (
    organization_id, scope, idempotency_key, request_hash,
    status, locked_at, expires_at, created_by
  ) values (
    target_org, normalized_scope, normalized_key, normalized_hash,
    'processing', now(), now() + make_interval(secs => greatest(60, ttl_seconds)), caller
  )
  on conflict (organization_id, scope, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;

  select * into existing
  from public.idempotency_records record
  where record.organization_id = target_org
    and record.scope = normalized_scope
    and record.idempotency_key = normalized_key
  for update;

  if inserted_count = 1 then
    return query select 'acquired'::text, existing.id, null::integer, null::jsonb;
    return;
  end if;

  if existing.request_hash <> normalized_hash then
    return query select 'conflict'::text, existing.id, existing.response_status, existing.response_body;
    return;
  end if;

  if existing.status = 'completed' then
    return query select 'replay'::text, existing.id, coalesce(existing.response_status, 200), existing.response_body;
    return;
  end if;

  if existing.status = 'processing'
     and existing.locked_at > now() - interval '5 minutes'
     and existing.expires_at > now() then
    return query select 'in_progress'::text, existing.id, null::integer, null::jsonb;
    return;
  end if;

  update public.idempotency_records record
  set status = 'processing',
      response_status = null,
      response_body = null,
      error_message = null,
      locked_at = now(),
      completed_at = null,
      expires_at = now() + make_interval(secs => greatest(60, ttl_seconds)),
      updated_at = now()
  where record.id = existing.id;

  return query select 'acquired'::text, existing.id, null::integer, null::jsonb;
end;
$$;

create or replace function public.complete_idempotent_request(
  target_record uuid,
  result_status integer,
  result_body jsonb default '{}'::jsonb,
  result_resource_type text default null,
  result_resource_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  update public.idempotency_records record
  set status = 'completed',
      response_status = result_status,
      response_body = coalesce(result_body, '{}'::jsonb),
      resource_type = nullif(btrim(coalesce(result_resource_type, '')), ''),
      resource_id = nullif(btrim(coalesce(result_resource_id, '')), ''),
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where record.id = target_record;
end;
$$;

create or replace function public.fail_idempotent_request(
  target_record uuid,
  failure_status integer default 500,
  failure_message text default null,
  failure_body jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  update public.idempotency_records record
  set status = 'failed',
      response_status = failure_status,
      response_body = failure_body,
      error_message = left(coalesce(failure_message, 'Operation failed.'), 4000),
      completed_at = now(),
      updated_at = now()
  where record.id = target_record;
end;
$$;

revoke all on function public.begin_idempotent_request(uuid, text, text, text, integer) from public;
revoke all on function public.complete_idempotent_request(uuid, integer, jsonb, text, text) from public;
revoke all on function public.fail_idempotent_request(uuid, integer, text, jsonb) from public;

grant execute on function public.begin_idempotent_request(uuid, text, text, text, integer)
  to authenticated, service_role;
grant execute on function public.complete_idempotent_request(uuid, integer, jsonb, text, text)
  to authenticated, service_role;
grant execute on function public.fail_idempotent_request(uuid, integer, text, jsonb)
  to authenticated, service_role;
