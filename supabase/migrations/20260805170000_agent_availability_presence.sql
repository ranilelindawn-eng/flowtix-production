-- Flowtix Phase 3.2: agent availability, device presence, busy detection,
-- wrap-up timers, DND, synchronization, and multi-device support.

create table if not exists public.agent_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  availability text not null default 'available'
    check (availability in ('available','away','offline','dnd')),
  activity_state text not null default 'idle'
    check (activity_state in ('idle','ringing','busy','wrap_up')),
  active_call_id uuid references public.calls(id) on delete set null,
  wrap_up_until timestamptz,
  last_seen_at timestamptz,
  last_available_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.agent_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null,
  provider text not null default 'browser',
  provider_identity text,
  device_type text not null default 'browser',
  status text not null default 'offline'
    check (status in ('online','offline','error')),
  supports_inbound boolean not null default true,
  current_call_id uuid references public.calls(id) on delete set null,
  last_heartbeat_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, device_key)
);

create table if not exists public.agent_presence_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.agent_devices(id) on delete set null,
  event_type text not null,
  from_availability text,
  to_availability text,
  from_activity_state text,
  to_activity_state text,
  call_id uuid references public.calls(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists agent_presence_routing_idx
  on public.agent_presence (organization_id, availability, activity_state, wrap_up_until, last_seen_at);
create index if not exists agent_devices_heartbeat_idx
  on public.agent_devices (organization_id, user_id, status, last_heartbeat_at desc);
create index if not exists agent_presence_history_user_idx
  on public.agent_presence_history (organization_id, user_id, occurred_at desc);

alter table public.agent_presence enable row level security;
alter table public.agent_devices enable row level security;
alter table public.agent_presence_history enable row level security;

drop policy if exists agent_presence_select on public.agent_presence;
create policy agent_presence_select on public.agent_presence for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists agent_presence_insert on public.agent_presence;
create policy agent_presence_insert on public.agent_presence for insert to authenticated
with check (public.is_org_member(organization_id) and user_id = auth.uid());
drop policy if exists agent_presence_update on public.agent_presence;
create policy agent_presence_update on public.agent_presence for update to authenticated
using (public.is_org_member(organization_id) and (user_id = auth.uid() or public.is_org_admin(organization_id)))
with check (public.is_org_member(organization_id) and (user_id = auth.uid() or public.is_org_admin(organization_id)));

drop policy if exists agent_devices_select on public.agent_devices;
create policy agent_devices_select on public.agent_devices for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists agent_devices_insert on public.agent_devices;
create policy agent_devices_insert on public.agent_devices for insert to authenticated
with check (public.is_org_member(organization_id) and user_id = auth.uid());
drop policy if exists agent_devices_update on public.agent_devices;
create policy agent_devices_update on public.agent_devices for update to authenticated
using (public.is_org_member(organization_id) and (user_id = auth.uid() or public.is_org_admin(organization_id)))
with check (public.is_org_member(organization_id) and (user_id = auth.uid() or public.is_org_admin(organization_id)));

drop policy if exists agent_presence_history_select on public.agent_presence_history;
create policy agent_presence_history_select on public.agent_presence_history for select to authenticated
using (public.is_org_member(organization_id));
drop policy if exists agent_presence_history_insert on public.agent_presence_history;
create policy agent_presence_history_insert on public.agent_presence_history for insert to authenticated
with check (public.is_org_member(organization_id) and (user_id = auth.uid() or public.is_org_admin(organization_id)));

create or replace function public.refresh_agent_presence(
  target_organization uuid,
  target_user uuid,
  target_device_key text,
  target_provider text,
  target_provider_identity text,
  target_device_status text,
  target_supports_inbound boolean,
  target_call uuid default null,
  target_metadata jsonb default '{}'::jsonb
) returns public.agent_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.agent_presence;
  now_value timestamptz := now();
  effective_activity text;
begin
  if target_user <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'Cannot update another user presence';
  end if;
  if auth.role() <> 'service_role' and not public.is_org_member(target_organization) then
    raise exception 'Organization membership required';
  end if;

  insert into public.agent_devices (
    organization_id,user_id,device_key,provider,provider_identity,status,
    supports_inbound,current_call_id,last_heartbeat_at,connected_at,disconnected_at,metadata
  ) values (
    target_organization,target_user,target_device_key,coalesce(nullif(target_provider,''),'browser'),
    target_provider_identity,target_device_status,target_supports_inbound,target_call,now_value,
    case when target_device_status = 'online' then now_value else null end,
    case when target_device_status <> 'online' then now_value else null end,
    coalesce(target_metadata,'{}'::jsonb)
  ) on conflict (organization_id,user_id,device_key) do update set
    provider = excluded.provider,
    provider_identity = excluded.provider_identity,
    status = excluded.status,
    supports_inbound = excluded.supports_inbound,
    current_call_id = excluded.current_call_id,
    last_heartbeat_at = now_value,
    connected_at = case when excluded.status = 'online' and agent_devices.status <> 'online' then now_value else agent_devices.connected_at end,
    disconnected_at = case when excluded.status <> 'online' then now_value else null end,
    metadata = agent_devices.metadata || excluded.metadata,
    updated_at = now_value;

  effective_activity := case when target_call is not null then 'busy' else 'idle' end;

  insert into public.agent_presence (
    organization_id,user_id,availability,activity_state,active_call_id,last_seen_at,last_available_at,metadata
  ) values (
    target_organization,target_user,
    case when target_device_status = 'online' then 'available' else 'offline' end,
    effective_activity,target_call,now_value,
    case when target_device_status = 'online' then now_value else null end,
    '{}'::jsonb
  ) on conflict (organization_id,user_id) do update set
    last_seen_at = now_value,
    activity_state = case
      when target_call is not null then 'busy'
      when agent_presence.activity_state = 'busy' and agent_presence.active_call_id is not null then agent_presence.activity_state
      when agent_presence.wrap_up_until is not null and agent_presence.wrap_up_until > now_value then 'wrap_up'
      else 'idle'
    end,
    active_call_id = coalesce(target_call, agent_presence.active_call_id),
    availability = case
      when agent_presence.availability in ('dnd','away') then agent_presence.availability
      when exists (
        select 1 from public.agent_devices d
        where d.organization_id = target_organization and d.user_id = target_user
          and d.status = 'online' and d.supports_inbound
          and d.last_heartbeat_at > now_value - interval '90 seconds'
      ) then 'available'
      else 'offline'
    end,
    last_available_at = case
      when exists (
        select 1 from public.agent_devices d
        where d.organization_id = target_organization and d.user_id = target_user
          and d.status = 'online' and d.supports_inbound
          and d.last_heartbeat_at > now_value - interval '90 seconds'
      ) then coalesce(agent_presence.last_available_at, now_value)
      else agent_presence.last_available_at
    end,
    updated_at = now_value
  returning * into result;

  return result;
end;
$$;

create or replace function public.set_agent_availability(
  target_organization uuid,
  target_user uuid,
  target_availability text,
  target_metadata jsonb default '{}'::jsonb
) returns public.agent_presence
language plpgsql
security definer
set search_path = public
as $$
declare previous public.agent_presence; result public.agent_presence;
begin
  if target_availability not in ('available','away','offline','dnd') then raise exception 'Invalid availability'; end if;
  if target_user <> auth.uid() and auth.role() <> 'service_role' and not public.is_org_admin(target_organization) then
    raise exception 'Cannot update another user availability';
  end if;
  select * into previous from public.agent_presence where organization_id=target_organization and user_id=target_user;
  insert into public.agent_presence (organization_id,user_id,availability,last_seen_at,last_available_at,metadata)
  values (target_organization,target_user,target_availability,now(),case when target_availability='available' then now() else null end,coalesce(target_metadata,'{}'::jsonb))
  on conflict (organization_id,user_id) do update set
    availability=excluded.availability,last_seen_at=now(),
    last_available_at=case when excluded.availability='available' then now() else agent_presence.last_available_at end,
    metadata=agent_presence.metadata || excluded.metadata,updated_at=now()
  returning * into result;
  insert into public.agent_presence_history (organization_id,user_id,event_type,from_availability,to_availability,from_activity_state,to_activity_state,metadata)
  values (target_organization,target_user,'availability_changed',previous.availability,result.availability,previous.activity_state,result.activity_state,coalesce(target_metadata,'{}'::jsonb));
  return result;
end;
$$;

create or replace function public.set_agent_call_activity(
  target_organization uuid,
  target_user uuid,
  target_state text,
  target_call uuid default null,
  wrap_up_seconds integer default 30,
  target_metadata jsonb default '{}'::jsonb
) returns public.agent_presence
language plpgsql
security definer
set search_path = public
as $$
declare previous public.agent_presence; result public.agent_presence; next_wrap timestamptz;
begin
  if target_state not in ('idle','ringing','busy','wrap_up') then raise exception 'Invalid activity state'; end if;
  if auth.role() <> 'service_role' and target_user <> auth.uid() then raise exception 'Cannot update another user activity'; end if;
  select * into previous from public.agent_presence where organization_id=target_organization and user_id=target_user;
  next_wrap := case when target_state='wrap_up' then now() + make_interval(secs => greatest(0,least(wrap_up_seconds,3600))) else null end;
  insert into public.agent_presence (organization_id,user_id,activity_state,active_call_id,wrap_up_until,last_seen_at,metadata)
  values (target_organization,target_user,target_state,case when target_state in ('ringing','busy') then target_call else null end,next_wrap,now(),coalesce(target_metadata,'{}'::jsonb))
  on conflict (organization_id,user_id) do update set
    activity_state=excluded.activity_state,active_call_id=excluded.active_call_id,wrap_up_until=excluded.wrap_up_until,
    last_seen_at=now(),metadata=agent_presence.metadata || excluded.metadata,updated_at=now()
  returning * into result;
  update public.agent_devices set current_call_id=result.active_call_id,updated_at=now()
    where organization_id=target_organization and user_id=target_user and status='online';
  insert into public.agent_presence_history (organization_id,user_id,event_type,from_availability,to_availability,from_activity_state,to_activity_state,call_id,metadata)
  values (target_organization,target_user,'activity_changed',previous.availability,result.availability,previous.activity_state,result.activity_state,target_call,coalesce(target_metadata,'{}'::jsonb));
  return result;
end;
$$;

revoke all on function public.refresh_agent_presence(uuid,uuid,text,text,text,text,boolean,uuid,jsonb) from public;
revoke all on function public.set_agent_availability(uuid,uuid,text,jsonb) from public;
revoke all on function public.set_agent_call_activity(uuid,uuid,text,uuid,integer,jsonb) from public;
grant execute on function public.refresh_agent_presence(uuid,uuid,text,text,text,text,boolean,uuid,jsonb) to authenticated, service_role;
grant execute on function public.set_agent_availability(uuid,uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.set_agent_call_activity(uuid,uuid,text,uuid,integer,jsonb) to authenticated, service_role;
