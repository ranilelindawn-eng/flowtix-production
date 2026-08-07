-- Flowtix Phase 2.1 — Platform Route & Security Hardening
--
-- Tightens the dedicated Platform identity helpers without changing customer
-- organization membership, PayMongo billing, or tenant RLS.
--
-- Customer organization roles remain completely independent from Platform
-- roles. Direct table access to platform_users remains denied.

begin;

alter table public.platform_users enable row level security;

revoke all on table public.platform_users
from public, anon, authenticated;

grant all on table public.platform_users
to service_role;

create or replace function public.get_current_platform_membership()
returns table (
  platform_user_id uuid,
  user_id uuid,
  role public.platform_role,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select
    platform_user.id,
    platform_user.user_id,
    platform_user.role,
    platform_user.is_active
  from public.platform_users platform_user
  where auth.uid() is not null
    and platform_user.user_id = auth.uid()
    and platform_user.is_active = true
  limit 1;
$function$;

create or replace function public.is_platform_user(
  required_roles public.platform_role[] default null
)
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
        and (
          required_roles is null
          or platform_user.role = any(required_roles)
        )
    );
$function$;

revoke all on function public.get_current_platform_membership()
from public, anon;

revoke all on function public.is_platform_user(public.platform_role[])
from public, anon;

grant execute on function public.get_current_platform_membership()
to authenticated;

grant execute on function public.is_platform_user(public.platform_role[])
to authenticated;

comment on function public.get_current_platform_membership() is
  'Returns only the active Platform identity belonging to auth.uid(). Customer organization membership never grants Platform access.';

comment on function public.is_platform_user(public.platform_role[]) is
  'Checks only platform_users for auth.uid(); organization roles are intentionally ignored.';

notify pgrst, 'reload schema';

commit;
