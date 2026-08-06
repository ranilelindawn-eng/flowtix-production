-- Flowtix Phase 3.1: inbound call-routing engine and routing attempts.

alter table public.calls
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists routing_attempt_id uuid,
  add column if not exists routing_status text,
  add column if not exists routing_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.call_routing_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  provider text not null,
  provider_call_id text not null,
  phone_number_id uuid references public.phone_numbers(id) on delete set null,
  ring_group_id uuid references public.ring_groups(id) on delete set null,
  queue_id uuid references public.call_queues(id) on delete set null,
  route_type text not null check (route_type in ('ring_group','queue','organization_fallback')),
  strategy text not null,
  status text not null default 'created' check (status in ('created','routing','ringing','answered','completed','failed','no_agents','cancelled')),
  selected_user_ids uuid[] not null default '{}'::uuid[],
  answered_by_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, provider_call_id),
  check (not (ring_group_id is not null and queue_id is not null))
);

create table if not exists public.call_routing_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  routing_attempt_id uuid not null references public.call_routing_attempts(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  user_id uuid references auth.users(id) on delete set null,
  provider_call_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.calls
  drop constraint if exists calls_routing_attempt_id_fkey;
alter table public.calls
  add constraint calls_routing_attempt_id_fkey
  foreign key (routing_attempt_id) references public.call_routing_attempts(id) on delete set null;

create index if not exists calls_owner_user_idx on public.calls(organization_id, owner_user_id);
create index if not exists calls_routing_attempt_idx on public.calls(routing_attempt_id);
create index if not exists call_routing_attempts_org_status_idx on public.call_routing_attempts(organization_id, status, created_at desc);
create index if not exists call_routing_attempts_call_idx on public.call_routing_attempts(call_id);
create index if not exists call_routing_history_attempt_idx on public.call_routing_history(routing_attempt_id, occurred_at);
create index if not exists call_routing_history_call_idx on public.call_routing_history(call_id, occurred_at);

alter table public.call_routing_attempts enable row level security;
alter table public.call_routing_history enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['call_routing_attempts','call_routing_history'] loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_insert on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_update on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_delete on public.%I', table_name, table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', table_name, table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_org_writer(organization_id))', table_name, table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id))', table_name, table_name);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_org_admin(organization_id))', table_name, table_name);
  end loop;
end $$;

create or replace function public.claim_inbound_call_answer(
  target_organization uuid,
  target_attempt uuid,
  target_user uuid,
  child_provider_call_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean;
begin
  update public.call_routing_attempts
  set answered_by_user_id = target_user,
      answered_at = coalesce(answered_at, now()),
      status = 'answered',
      updated_at = now(),
      metadata = metadata || jsonb_build_object('answer_provider_call_id', child_provider_call_id)
  where id = target_attempt
    and organization_id = target_organization
    and answered_by_user_id is null
    and status in ('created','routing','ringing')
  returning true into claimed;

  if coalesce(claimed, false) then
    update public.calls
    set owner_user_id = target_user,
        routing_status = 'answered',
        status = 'connected',
        provider_child_call_sid = coalesce(child_provider_call_id, provider_child_call_sid),
        updated_at = now()
    where routing_attempt_id = target_attempt
      and organization_id = target_organization;

    insert into public.call_routing_history (
      organization_id, call_id, routing_attempt_id, event_type,
      from_status, to_status, user_id, provider_call_id
    )
    select organization_id, call_id, id, 'answer_claimed', 'ringing', 'answered',
           target_user, child_provider_call_id
    from public.call_routing_attempts where id = target_attempt;
  end if;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_inbound_call_answer(uuid, uuid, uuid, text) from public;
grant execute on function public.claim_inbound_call_answer(uuid, uuid, uuid, text) to service_role;
