begin;

-- Flowtix outbound browser-softphone availability persistence fix.
--
-- The browser softphone is intentionally registered with supports_inbound=false.
-- A healthy outbound-only heartbeat must not overwrite the agent's explicit
-- availability selection (Available / Away / Do not disturb / Offline).
--
-- Inbound-capable devices keep the existing routing-aware behavior unchanged.
-- Call ownership/runtime recovery logic from 20260812030000 is preserved.

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
as $function$
declare
  result public.agent_presence;
  now_value timestamptz := now();
  effective_activity text;
  preserved_live_call uuid;
begin
  if target_user <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'Cannot update another user presence';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_org_member(target_organization) then
    raise exception 'Organization membership required';
  end if;

  if target_device_status not in ('online', 'offline', 'error') then
    raise exception 'Invalid device status';
  end if;

  -- Keep an existing call only while Flowtix still considers that call live.
  select case
    when p.active_call_id is not null
      and public.flowtix_call_is_runtime_active(target_organization, p.active_call_id)
    then p.active_call_id
    else null
  end
  into preserved_live_call
  from public.agent_presence p
  where p.organization_id = target_organization
    and p.user_id = target_user;

  preserved_live_call := coalesce(target_call, preserved_live_call);

  insert into public.agent_devices (
    organization_id,
    user_id,
    device_key,
    provider,
    provider_identity,
    status,
    supports_inbound,
    current_call_id,
    last_heartbeat_at,
    connected_at,
    disconnected_at,
    metadata
  )
  values (
    target_organization,
    target_user,
    target_device_key,
    coalesce(nullif(target_provider, ''), 'browser'),
    target_provider_identity,
    target_device_status,
    target_supports_inbound,
    preserved_live_call,
    now_value,
    case when target_device_status = 'online' then now_value else null end,
    case when target_device_status <> 'online' then now_value else null end,
    coalesce(target_metadata, '{}'::jsonb)
  )
  on conflict (organization_id, user_id, device_key)
  do update set
    provider = excluded.provider,
    provider_identity = excluded.provider_identity,
    status = excluded.status,
    supports_inbound = excluded.supports_inbound,
    current_call_id = excluded.current_call_id,
    last_heartbeat_at = now_value,
    connected_at = case
      when excluded.status = 'online' and agent_devices.status <> 'online'
      then now_value
      else agent_devices.connected_at
    end,
    disconnected_at = case
      when excluded.status <> 'online' then now_value
      else null
    end,
    metadata = agent_devices.metadata || excluded.metadata,
    updated_at = now_value;

  effective_activity := case
    when preserved_live_call is not null then 'busy'
    else 'idle'
  end;

  insert into public.agent_presence (
    organization_id,
    user_id,
    availability,
    activity_state,
    active_call_id,
    last_seen_at,
    last_available_at,
    metadata
  )
  values (
    target_organization,
    target_user,
    case when target_device_status = 'online' then 'available' else 'offline' end,
    effective_activity,
    preserved_live_call,
    now_value,
    case when target_device_status = 'online' then now_value else null end,
    '{}'::jsonb
  )
  on conflict (organization_id, user_id)
  do update set
    last_seen_at = now_value,

    -- Preserve provider-controlled busy/ringing only for a genuinely live call.
    -- Expired wrap-up and stale call ownership are recovered to idle.
    activity_state = case
      when preserved_live_call is not null then
        case
          when agent_presence.activity_state = 'ringing' then 'ringing'
          else 'busy'
        end
      when agent_presence.wrap_up_until is not null
        and agent_presence.wrap_up_until > now_value then 'wrap_up'
      else 'idle'
    end,

    active_call_id = preserved_live_call,

    wrap_up_until = case
      when preserved_live_call is not null then null
      when agent_presence.wrap_up_until is not null
        and agent_presence.wrap_up_until > now_value
      then agent_presence.wrap_up_until
      else null
    end,

    availability = case
      -- The Flowtix browser softphone is currently outbound-only. Its online
      -- heartbeat must not reset a user's explicit availability selection.
      when target_supports_inbound = false
        and target_device_status = 'online'
      then agent_presence.availability

      -- Existing inbound/routing behavior remains unchanged.
      when agent_presence.availability in ('dnd', 'away')
        then agent_presence.availability
      when exists (
        select 1
        from public.agent_devices d
        where d.organization_id = target_organization
          and d.user_id = target_user
          and d.status = 'online'
          and d.supports_inbound = true
          and d.last_heartbeat_at > now_value - interval '90 seconds'
      ) then 'available'
      else 'offline'
    end,

    last_available_at = case
      when exists (
        select 1
        from public.agent_devices d
        where d.organization_id = target_organization
          and d.user_id = target_user
          and d.status = 'online'
          and d.supports_inbound = true
          and d.last_heartbeat_at > now_value - interval '90 seconds'
      ) then coalesce(agent_presence.last_available_at, now_value)
      else agent_presence.last_available_at
    end,

    updated_at = now_value
  returning * into result;

  return result;
end;
$function$;

revoke all on function public.refresh_agent_presence(
  uuid, uuid, text, text, text, text, boolean, uuid, jsonb
) from public, anon;

grant execute on function public.refresh_agent_presence(
  uuid, uuid, text, text, text, text, boolean, uuid, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;