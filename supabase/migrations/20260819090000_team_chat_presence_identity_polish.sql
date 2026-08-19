begin;

-- Team Chat presence now has an explicit online/offline state.
-- last_seen_at remains the stale-session safety net when a browser closes
-- without using Flowtix's normal Logout control.
alter table public.team_chat_presence
  add column if not exists is_online boolean not null default false;

update public.team_chat_presence
set is_online = (last_seen_at >= now() - interval '2 minutes');

create or replace function public.team_chat_touch_presence()
returns timestamptz
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select membership.organization_id
  into v_org
  from public.get_current_organization_membership() membership
  limit 1;

  if v_org is null then
    raise exception 'ACTIVE_ORGANIZATION_REQUIRED' using errcode = '42501';
  end if;

  insert into public.team_chat_presence (
    organization_id,
    user_id,
    last_seen_at,
    is_online
  )
  values (
    v_org,
    v_user,
    v_now,
    true
  )
  on conflict (organization_id, user_id)
  do update set
    last_seen_at = excluded.last_seen_at,
    is_online = true;

  return v_now;
end;
$function$;

create or replace function public.team_chat_set_presence(
  p_online boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_now timestamptz := now();
  v_online boolean := coalesce(p_online, false);
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select membership.organization_id
  into v_org
  from public.get_current_organization_membership() membership
  limit 1;

  if v_org is null then
    raise exception 'ACTIVE_ORGANIZATION_REQUIRED' using errcode = '42501';
  end if;

  insert into public.team_chat_presence (
    organization_id,
    user_id,
    last_seen_at,
    is_online
  )
  values (
    v_org,
    v_user,
    v_now,
    v_online
  )
  on conflict (organization_id, user_id)
  do update set
    last_seen_at = excluded.last_seen_at,
    is_online = excluded.is_online;

  return v_now;
end;
$function$;

revoke all on function public.team_chat_touch_presence()
from public, anon;
revoke all on function public.team_chat_set_presence(boolean)
from public, anon;

grant execute on function public.team_chat_touch_presence()
to authenticated;
grant execute on function public.team_chat_set_presence(boolean)
to authenticated;

notify pgrst, 'reload schema';

commit;
