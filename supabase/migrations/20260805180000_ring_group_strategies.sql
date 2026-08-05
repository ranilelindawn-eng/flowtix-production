-- Flowtix Phase 3.3: production ring-group strategies, weighted routing,
-- deterministic cursors, overflow, failover, and per-agent routing statistics.

alter table public.ring_groups
  drop constraint if exists ring_groups_strategy_check;

alter table public.ring_groups
  add constraint ring_groups_strategy_check
  check (strategy in (
    'simultaneous','sequential','round_robin','least_recently_called',
    'longest_idle','weighted'
  ));

alter table public.ring_groups
  add column if not exists overflow_ring_group_id uuid references public.ring_groups(id) on delete set null,
  add column if not exists failover_queue_id uuid references public.call_queues(id) on delete set null,
  add column if not exists failover_number text,
  add column if not exists overflow_timeout_seconds integer not null default 20
    check (overflow_timeout_seconds between 5 and 120),
  add column if not exists max_routing_targets integer not null default 10
    check (max_routing_targets between 1 and 50),
  add column if not exists routing_cursor bigint not null default 0;

alter table public.ring_groups
  drop constraint if exists ring_groups_failover_target_check;
alter table public.ring_groups
  add constraint ring_groups_failover_target_check
  check (not (failover_queue_id is not null and nullif(btrim(failover_number), '') is not null));

alter table public.ring_group_members
  add column if not exists weight integer not null default 1
    check (weight between 1 and 100),
  add column if not exists last_routed_at timestamptz,
  add column if not exists last_answered_at timestamptz,
  add column if not exists routed_count bigint not null default 0,
  add column if not exists answered_count bigint not null default 0;

create index if not exists ring_group_members_strategy_idx
  on public.ring_group_members (organization_id, ring_group_id, is_active, priority, last_routed_at, last_answered_at);
create index if not exists ring_groups_overflow_idx
  on public.ring_groups (organization_id, overflow_ring_group_id)
  where overflow_ring_group_id is not null;

create or replace function public.advance_ring_group_cursor(
  target_organization uuid,
  target_ring_group uuid,
  member_count integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_position integer;
begin
  if member_count <= 0 then return 0; end if;

  update public.ring_groups
  set routing_cursor = routing_cursor + 1,
      updated_at = now()
  where id = target_ring_group
    and organization_id = target_organization
  returning ((routing_cursor - 1) % member_count)::integer into next_position;

  return coalesce(next_position, 0);
end;
$$;

create or replace function public.mark_ring_group_targets_routed(
  target_organization uuid,
  target_ring_group uuid,
  target_users uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ring_group_members
  set last_routed_at = now(),
      routed_count = routed_count + 1
  where organization_id = target_organization
    and ring_group_id = target_ring_group
    and user_id = any(target_users);
end;
$$;

create or replace function public.mark_ring_group_member_answered(
  target_organization uuid,
  target_ring_group uuid,
  target_user uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ring_group_members
  set last_answered_at = now(),
      answered_count = answered_count + 1
  where organization_id = target_organization
    and ring_group_id = target_ring_group
    and user_id = target_user;
end;
$$;

revoke all on function public.advance_ring_group_cursor(uuid,uuid,integer) from public;
revoke all on function public.mark_ring_group_targets_routed(uuid,uuid,uuid[]) from public;
revoke all on function public.mark_ring_group_member_answered(uuid,uuid,uuid) from public;
grant execute on function public.advance_ring_group_cursor(uuid,uuid,integer) to service_role;
grant execute on function public.mark_ring_group_targets_routed(uuid,uuid,uuid[]) to service_role;
grant execute on function public.mark_ring_group_member_answered(uuid,uuid,uuid) to service_role;
