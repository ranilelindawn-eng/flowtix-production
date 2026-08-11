-- Flowtix Ring Groups customer-management RPCs.
-- Adds atomic organization-scoped create/update/delete management while
-- preserving the existing routing engine, schema, and RLS architecture.

begin;

-- Customer dashboard reads/writes still remain protected by RLS.
revoke all on table public.ring_groups from anon;
revoke all on table public.ring_group_members from anon;

grant select, insert, update, delete on table public.ring_groups to authenticated;
grant select, insert, update, delete on table public.ring_group_members to authenticated;

grant all on table public.ring_groups to service_role;
grant all on table public.ring_group_members to service_role;

alter table public.ring_groups enable row level security;
alter table public.ring_group_members enable row level security;

create or replace function public.create_ring_group_configuration(
  target_organization uuid,
  group_name text,
  group_strategy text,
  ring_timeout integer,
  overflow_timeout integer,
  routing_target_limit integer,
  overflow_group uuid,
  failover_queue uuid,
  failover_phone text,
  active boolean,
  member_users uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  new_group_id uuid;
  normalized_name text := nullif(btrim(group_name), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_org_admin(target_organization) then
    raise exception 'Organization admin permission required' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Ring group name is required';
  end if;

  if group_strategy not in (
    'simultaneous',
    'sequential',
    'round_robin',
    'least_recently_called',
    'longest_idle',
    'weighted'
  ) then
    raise exception 'Invalid ring-group strategy';
  end if;

  if ring_timeout not between 5 and 120 then
    raise exception 'Ring timeout must be between 5 and 120 seconds';
  end if;

  if overflow_timeout not between 5 and 120 then
    raise exception 'Overflow timeout must be between 5 and 120 seconds';
  end if;

  if routing_target_limit not between 1 and 50 then
    raise exception 'Maximum routing targets must be between 1 and 50';
  end if;

  if overflow_group is not null and not exists (
    select 1
    from public.ring_groups rg
    where rg.id = overflow_group
      and rg.organization_id = target_organization
  ) then
    raise exception 'Overflow ring group does not belong to this organization';
  end if;

  if failover_queue is not null and not exists (
    select 1
    from public.call_queues cq
    where cq.id = failover_queue
      and cq.organization_id = target_organization
  ) then
    raise exception 'Failover queue does not belong to this organization';
  end if;

  if failover_queue is not null and nullif(btrim(failover_phone), '') is not null then
    raise exception 'Choose either a failover queue or a failover number, not both';
  end if;

  if exists (
    select 1
    from unnest(coalesce(member_users, '{}'::uuid[])) member_user
    where not exists (
      select 1
      from public.organization_members om
      where om.organization_id = target_organization
        and om.user_id = member_user
        and coalesce(om.status::text, 'active') = 'active'
    )
  ) then
    raise exception 'One or more selected agents are not active organization members';
  end if;

  insert into public.ring_groups (
    organization_id,
    name,
    strategy,
    ring_timeout_seconds,
    overflow_timeout_seconds,
    max_routing_targets,
    overflow_ring_group_id,
    failover_queue_id,
    failover_number,
    is_active,
    created_by
  )
  values (
    target_organization,
    normalized_name,
    group_strategy,
    ring_timeout,
    overflow_timeout,
    routing_target_limit,
    overflow_group,
    failover_queue,
    nullif(btrim(failover_phone), ''),
    coalesce(active, true),
    auth.uid()
  )
  returning id into new_group_id;

  insert into public.ring_group_members (
    organization_id,
    ring_group_id,
    user_id,
    priority,
    is_active
  )
  select
    target_organization,
    new_group_id,
    member_user,
    member_ordinality - 1,
    true
  from unnest(coalesce(member_users, '{}'::uuid[]))
       with ordinality as members(member_user, member_ordinality)
  on conflict (ring_group_id, user_id)
  do update set
    priority = excluded.priority,
    is_active = true;

  return new_group_id;
end;
$function$;

create or replace function public.update_ring_group_configuration(
  target_organization uuid,
  target_ring_group uuid,
  group_name text,
  group_strategy text,
  ring_timeout integer,
  overflow_timeout integer,
  routing_target_limit integer,
  overflow_group uuid,
  failover_queue uuid,
  failover_phone text,
  active boolean,
  member_users uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  normalized_name text := nullif(btrim(group_name), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_org_admin(target_organization) then
    raise exception 'Organization admin permission required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ring_groups rg
    where rg.id = target_ring_group
      and rg.organization_id = target_organization
  ) then
    raise exception 'Ring group not found';
  end if;

  if normalized_name is null then
    raise exception 'Ring group name is required';
  end if;

  if group_strategy not in (
    'simultaneous',
    'sequential',
    'round_robin',
    'least_recently_called',
    'longest_idle',
    'weighted'
  ) then
    raise exception 'Invalid ring-group strategy';
  end if;

  if ring_timeout not between 5 and 120 then
    raise exception 'Ring timeout must be between 5 and 120 seconds';
  end if;

  if overflow_timeout not between 5 and 120 then
    raise exception 'Overflow timeout must be between 5 and 120 seconds';
  end if;

  if routing_target_limit not between 1 and 50 then
    raise exception 'Maximum routing targets must be between 1 and 50';
  end if;

  if overflow_group = target_ring_group then
    raise exception 'A ring group cannot overflow to itself';
  end if;

  if overflow_group is not null and not exists (
    select 1
    from public.ring_groups rg
    where rg.id = overflow_group
      and rg.organization_id = target_organization
  ) then
    raise exception 'Overflow ring group does not belong to this organization';
  end if;

  if failover_queue is not null and not exists (
    select 1
    from public.call_queues cq
    where cq.id = failover_queue
      and cq.organization_id = target_organization
  ) then
    raise exception 'Failover queue does not belong to this organization';
  end if;

  if failover_queue is not null and nullif(btrim(failover_phone), '') is not null then
    raise exception 'Choose either a failover queue or a failover number, not both';
  end if;

  if exists (
    select 1
    from unnest(coalesce(member_users, '{}'::uuid[])) member_user
    where not exists (
      select 1
      from public.organization_members om
      where om.organization_id = target_organization
        and om.user_id = member_user
        and coalesce(om.status::text, 'active') = 'active'
    )
  ) then
    raise exception 'One or more selected agents are not active organization members';
  end if;

  update public.ring_groups
  set
    name = normalized_name,
    strategy = group_strategy,
    ring_timeout_seconds = ring_timeout,
    overflow_timeout_seconds = overflow_timeout,
    max_routing_targets = routing_target_limit,
    overflow_ring_group_id = overflow_group,
    failover_queue_id = failover_queue,
    failover_number = nullif(btrim(failover_phone), ''),
    is_active = coalesce(active, false),
    updated_at = pg_catalog.now()
  where id = target_ring_group
    and organization_id = target_organization;

  -- Keep historical membership rows, but deactivate anything no longer selected.
  update public.ring_group_members
  set is_active = false
  where organization_id = target_organization
    and ring_group_id = target_ring_group;

  insert into public.ring_group_members (
    organization_id,
    ring_group_id,
    user_id,
    priority,
    is_active
  )
  select
    target_organization,
    target_ring_group,
    member_user,
    member_ordinality - 1,
    true
  from unnest(coalesce(member_users, '{}'::uuid[]))
       with ordinality as members(member_user, member_ordinality)
  on conflict (ring_group_id, user_id)
  do update set
    priority = excluded.priority,
    is_active = true;
end;
$function$;

create or replace function public.delete_ring_group_configuration(
  target_organization uuid,
  target_ring_group uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_org_admin(target_organization) then
    raise exception 'Organization admin permission required' using errcode = '42501';
  end if;

  delete from public.ring_groups
  where id = target_ring_group
    and organization_id = target_organization;

  if not found then
    raise exception 'Ring group not found';
  end if;
end;
$function$;

revoke all on function public.create_ring_group_configuration(
  uuid,text,text,integer,integer,integer,uuid,uuid,text,boolean,uuid[]
) from public;
revoke all on function public.update_ring_group_configuration(
  uuid,uuid,text,text,integer,integer,integer,uuid,uuid,text,boolean,uuid[]
) from public;
revoke all on function public.delete_ring_group_configuration(uuid,uuid) from public;

grant execute on function public.create_ring_group_configuration(
  uuid,text,text,integer,integer,integer,uuid,uuid,text,boolean,uuid[]
) to authenticated;
grant execute on function public.update_ring_group_configuration(
  uuid,uuid,text,text,integer,integer,integer,uuid,uuid,text,boolean,uuid[]
) to authenticated;
grant execute on function public.delete_ring_group_configuration(uuid,uuid) to authenticated;

grant execute on function public.create_ring_group_configuration(
  uuid,text,text,integer,integer,integer,uuid,uuid,text,boolean,uuid[]
) to service_role;
grant execute on function public.update_ring_group_configuration(
  uuid,uuid,text,text,integer,integer,integer,uuid,uuid,text,boolean,uuid[]
) to service_role;
grant execute on function public.delete_ring_group_configuration(uuid,uuid) to service_role;

commit;

notify pgrst, 'reload schema';
