begin;

create type public.platform_role as enum (
  'platform_owner',
  'platform_admin',
  'finance',
  'support',
  'developer'
);

create table if not exists public.platform_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.platform_role not null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_users enable row level security;
revoke all on table public.platform_users from public, anon, authenticated;

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
set search_path = public
as $$
  select pu.id, pu.user_id, pu.role, pu.is_active
  from public.platform_users pu
  where pu.user_id = auth.uid()
    and pu.is_active = true
  limit 1;
$$;

revoke all on function public.get_current_platform_membership() from public, anon;
grant execute on function public.get_current_platform_membership() to authenticated;

create or replace function public.is_platform_user(required_roles public.platform_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_users pu
    where pu.user_id = auth.uid()
      and pu.is_active = true
      and (required_roles is null or pu.role = any(required_roles))
  );
$$;

revoke all on function public.is_platform_user(public.platform_role[]) from public, anon;
grant execute on function public.is_platform_user(public.platform_role[]) to authenticated;

comment on table public.platform_users is
  'Flowtix staff identities. Organization memberships never grant platform access.';
comment on function public.get_current_platform_membership() is
  'Returns only the authenticated staff member platform identity.';

commit;
