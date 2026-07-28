-- CallFlow: fix Auth signup rollback caused by legacy profile constraints.
-- Safe to run more than once.

begin;

-- Invitation signups intentionally have no active organization until the
-- invitation is accepted, so profiles.organization_id must be nullable.
alter table public.profiles
  add column if not exists organization_id uuid;

alter table public.profiles
  alter column organization_id drop not null;

-- Normalize the active-organization foreign key.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%(organization_id)%'
  loop
    execute format(
      'alter table public.profiles drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;

  alter table public.profiles
    add constraint profiles_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete set null;
end;
$$;

create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id);

-- Some older CallFlow schemas require created_by on memberships. Keep the
-- column available and nullable for backwards compatibility.
alter table public.organization_members
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Remove historical competing trigger implementations.
drop trigger if exists auth_user_signup_trigger on auth.users;
drop trigger if exists on_auth_user_created_callflow on auth.users;
drop trigger if exists zzz_cleanup_invited_user_workspace on auth.users;

create or replace function public.bootstrap_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  new_organization_id uuid;
  starter_plan_id uuid;
  profile_name text;
  organization_name text;
  organization_slug text;
  is_invited_user boolean;
begin
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  is_invited_user := coalesce(
    nullif(new.raw_user_meta_data ->> 'invited_user', '')::boolean,
    false
  );

  -- Invited users must not receive an accidental personal workspace.
  if is_invited_user then
    insert into public.profiles (
      id,
      email,
      full_name,
      organization_id,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.email,
      profile_name,
      null,
      now(),
      now()
    )
    on conflict (id) do update
    set
      email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      organization_id = null,
      updated_at = now();

    return new;
  end if;

  select plan.id
  into starter_plan_id
  from public.subscription_plans as plan
  where plan.code = 'starter'
    and plan.is_active = true
  limit 1;

  if starter_plan_id is null then
    raise exception 'The active Starter subscription plan is missing.';
  end if;

  organization_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    profile_name || '''s Workspace'
  );

  organization_slug :=
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

  -- Create the owner workspace first so the profile never violates a legacy
  -- NOT NULL organization relationship during signup.
  insert into public.organizations (
    name,
    slug,
    created_by,
    created_at,
    updated_at
  )
  values (
    organization_name,
    organization_slug,
    new.id,
    now(),
    now()
  )
  returning id into new_organization_id;

  insert into public.profiles (
    id,
    email,
    full_name,
    organization_id,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    profile_name,
    new_organization_id,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    organization_id = excluded.organization_id,
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
    new_organization_id,
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
    new_organization_id,
    starter_plan_id,
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
$$;

revoke all on function public.bootstrap_new_user() from public;

create trigger on_auth_user_created_callflow
after insert on auth.users
for each row
execute function public.bootstrap_new_user();

commit;

-- Verification.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
order by trigger_name;
