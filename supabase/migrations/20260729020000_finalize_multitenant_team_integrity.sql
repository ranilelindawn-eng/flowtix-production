-- CallFlow canonical multi-tenant team integrity migration.
-- This migration intentionally runs after every earlier 20260729 patch and
-- leaves one authoritative implementation for signup, organization lookup,
-- invitation acceptance, team visibility, audit logging, and owner updates.

begin;

create extension if not exists pgcrypto;

-- Compatibility with the legacy schema used by this project.
alter table public.profiles
  add column if not exists organization_id uuid;

alter table public.profiles
  alter column organization_id drop not null;

alter table public.profiles
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.organization_members
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id);

-- Exactly one Auth bootstrap trigger must remain.
drop trigger if exists auth_user_signup_trigger on auth.users;
drop trigger if exists on_auth_user_created_callflow on auth.users;
drop trigger if exists zzz_cleanup_invited_user_workspace on auth.users;

create or replace function public.bootstrap_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_organization_id uuid;
  v_starter_plan_id uuid;
  v_profile_name text;
  v_organization_name text;
  v_organization_slug text;
  v_is_invited_user boolean;
begin
  v_profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  v_is_invited_user := coalesce(
    nullif(new.raw_user_meta_data ->> 'invited_user', '')::boolean,
    false
  );

  -- Invitation signups receive a profile only. Their organization is assigned
  -- atomically by accept_organization_invitation().
  if v_is_invited_user then
    insert into public.profiles (
      id,
      email,
      full_name,
      organization_id,
      created_by,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.email,
      v_profile_name,
      null,
      new.id,
      now(),
      now()
    )
    on conflict (id) do update
    set
      email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      organization_id = null,
      created_by = coalesce(public.profiles.created_by, excluded.created_by),
      updated_at = now();

    return new;
  end if;

  select plan.id
  into v_starter_plan_id
  from public.subscription_plans as plan
  where plan.code = 'starter'
    and plan.is_active = true
  limit 1;

  if v_starter_plan_id is null then
    raise exception 'The active Starter subscription plan is missing.';
  end if;

  v_organization_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    v_profile_name || '''s Workspace'
  );

  v_organization_slug :=
    lower(
      trim(
        both '-'
        from regexp_replace(
          split_part(coalesce(new.email, new.id::text), '@', 1),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    ) || '-' || substr(new.id::text, 1, 8);

  insert into public.organizations (
    name,
    slug,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_organization_name,
    v_organization_slug,
    new.id,
    now(),
    now()
  )
  returning id into v_organization_id;

  insert into public.profiles (
    id,
    email,
    full_name,
    organization_id,
    created_by,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    v_profile_name,
    v_organization_id,
    new.id,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    organization_id = excluded.organization_id,
    created_by = coalesce(public.profiles.created_by, excluded.created_by),
    updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_organization_id,
    new.id,
    'owner',
    'active',
    new.id,
    now(),
    now()
  )
  on conflict (organization_id, user_id) do update
  set
    role = 'owner',
    status = 'active',
    created_by = coalesce(public.organization_members.created_by, excluded.created_by),
    updated_at = now();

  insert into public.organization_subscriptions (
    organization_id,
    plan_id,
    status,
    created_at,
    updated_at
  )
  values (
    v_organization_id,
    v_starter_plan_id,
    'active',
    now(),
    now()
  )
  on conflict (organization_id) do update
  set
    plan_id = excluded.plan_id,
    status = excluded.status,
    updated_at = now();

  return new;
end;
$function$;

revoke all on function public.bootstrap_new_user() from public;

create trigger on_auth_user_created_callflow
after insert on auth.users
for each row
execute function public.bootstrap_new_user();

-- This function performs a profile repair, therefore it must be VOLATILE.
-- Earlier versions incorrectly marked it STABLE and also used an ambiguous
-- organization_id reference.
create or replace function public.get_current_organization_membership()
returns table (
  organization_id uuid,
  role text
)
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_organization_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return;
  end if;

  select om.organization_id
  into v_organization_id
  from public.organization_members as om
  left join public.profiles as p
    on p.id = v_user_id
  where om.user_id = v_user_id
    and coalesce(om.status::text, 'active') = 'active'
    and om.role::text in ('owner', 'admin', 'manager', 'agent')
  order by
    case when om.organization_id = p.organization_id then 0 else 1 end,
    om.created_at asc
  limit 1;

  if v_organization_id is null then
    return;
  end if;

  update public.profiles as p
  set
    organization_id = v_organization_id,
    updated_at = now()
  where p.id = v_user_id
    and p.organization_id is distinct from v_organization_id;

  return query
  select
    om.organization_id::uuid,
    om.role::text
  from public.organization_members as om
  where om.user_id = v_user_id
    and om.organization_id = v_organization_id
    and coalesce(om.status::text, 'active') = 'active'
    and om.role::text in ('owner', 'admin', 'manager', 'agent')
  order by om.created_at asc
  limit 1;
end;
$function$;

revoke all on function public.get_current_organization_membership() from public;
grant execute on function public.get_current_organization_membership()
  to authenticated, service_role;

create or replace function public.get_current_organization_team_members()
returns table (
  id uuid,
  organization_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  full_name text,
  email text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  with current_membership as (
    select om.organization_id
    from public.organization_members as om
    left join public.profiles as p
      on p.id = auth.uid()
    where om.user_id = auth.uid()
      and coalesce(om.status::text, 'active') = 'active'
      and om.role::text in ('owner', 'admin', 'manager', 'agent')
    order by
      case when om.organization_id = p.organization_id then 0 else 1 end,
      om.created_at asc
    limit 1
  )
  select
    om.id,
    om.organization_id,
    om.user_id,
    om.role::text,
    om.created_at,
    p.full_name,
    coalesce(p.email, account.email) as email,
    p.avatar_url
  from public.organization_members as om
  join current_membership as cm
    on cm.organization_id = om.organization_id
  left join public.profiles as p
    on p.id = om.user_id
  left join auth.users as account
    on account.id = om.user_id
  where coalesce(om.status::text, 'active') = 'active'
    and om.role::text in ('owner', 'admin', 'manager', 'agent')
  order by om.created_at asc;
$function$;

revoke all on function public.get_current_organization_team_members() from public;
grant execute on function public.get_current_organization_team_members()
  to authenticated, service_role;

create or replace function public.accept_organization_invitation(
  invitation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_invitation public.organization_invitations%rowtype;
  v_email text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    lower(account.email),
    coalesce(
      nullif(trim(account.raw_user_meta_data ->> 'full_name'), ''),
      split_part(account.email, '@', 1)
    )
  into v_email, v_name
  from auth.users as account
  where account.id = auth.uid();

  if v_email is null then
    raise exception 'Authenticated user email not found';
  end if;

  select invitation.*
  into v_invitation
  from public.organization_invitations as invitation
  where invitation.token = invitation_token
  for update;

  if v_invitation.id is null then
    raise exception 'Invitation unavailable';
  end if;

  if v_invitation.accepted_at is not null then
    raise exception 'Invitation already accepted';
  end if;

  if v_invitation.revoked_at is not null then
    raise exception 'Invitation revoked';
  end if;

  if v_invitation.expires_at <= now() then
    update public.organization_invitations as invitation
    set revoked_at = now(), updated_at = now()
    where invitation.id = v_invitation.id;

    raise exception 'Invitation expired';
  end if;

  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    organization_id,
    created_by,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    v_email,
    v_name,
    v_invitation.organization_id,
    auth.uid(),
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    organization_id = excluded.organization_id,
    created_by = coalesce(public.profiles.created_by, excluded.created_by),
    updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_invitation.organization_id,
    auth.uid(),
    v_invitation.role,
    'active',
    v_invitation.invited_by,
    now(),
    now()
  )
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    status = 'active',
    created_by = coalesce(public.organization_members.created_by, excluded.created_by),
    updated_at = now();

  update public.organization_invitations as invitation
  set
    accepted_by = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where invitation.id = v_invitation.id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  if not found then
    raise exception 'Invitation was already processed';
  end if;

  return true;
end;
$function$;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid)
  to authenticated, service_role;

create or replace function public.log_audit_event(
  p_action text,
  p_resource_type text default null,
  p_resource_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_organization_id uuid;
  v_audit_log_id uuid;
begin
  select om.organization_id
  into v_organization_id
  from public.organization_members as om
  where om.user_id = auth.uid()
    and coalesce(om.status::text, 'active') = 'active'
  order by om.created_at asc nulls last
  limit 1;

  insert into public.audit_logs (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent
  )
  values (
    v_organization_id,
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_ip_address,
    p_user_agent
  )
  returning id into v_audit_log_id;

  return v_audit_log_id;
end;
$function$;

revoke all on function public.log_audit_event(text,text,text,jsonb,inet,text)
  from public;
grant execute on function public.log_audit_event(text,text,text,jsonb,inet,text)
  to authenticated, service_role;

alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;

drop policy if exists organization_members_select_self
  on public.organization_members;
create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists organizations_update_admins on public.organizations;
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_update_owner_only on public.organizations;
create policy organizations_update_owner_only
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members as om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
      and coalesce(om.status::text, 'active') = 'active'
      and om.role::text = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organization_members as om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
      and coalesce(om.status::text, 'active') = 'active'
      and om.role::text = 'owner'
  )
);

commit;

-- Verification output.
select
  routine_name,
  security_type,
  data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'bootstrap_new_user',
    'get_current_organization_membership',
    'get_current_organization_team_members',
    'accept_organization_invitation',
    'log_audit_event'
  )
order by routine_name;

select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
order by trigger_name;
