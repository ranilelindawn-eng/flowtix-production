-- CallFlow: canonical Auth signup bootstrap repair
-- Replaces competing legacy auth.users triggers with one deterministic trigger.

begin;

-- Remove both historical trigger implementations. Having both active can create
-- duplicate organizations/profiles and roll back the auth.users insert.
drop trigger if exists auth_user_signup_trigger on auth.users;
drop trigger if exists on_auth_user_created_callflow on auth.users;
drop trigger if exists zzz_cleanup_invited_user_workspace on auth.users;

-- Remove only the obsolete legacy bootstrap function. The canonical function
-- below is recreated in place.
drop function if exists public.handle_new_user_signup();

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
    (new.raw_user_meta_data ->> 'invited_user')::boolean,
    false
  );

  -- Every auth user receives exactly one profile. Invitation signups stop here;
  -- their organization is assigned atomically when the invitation is accepted.
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
    updated_at = now();

  if is_invited_user then
    return new;
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

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    new_organization_id,
    new.id,
    'owner',
    'active',
    now(),
    now()
  )
  on conflict (organization_id, user_id) do update
  set
    role = 'owner',
    status = 'active',
    updated_at = now();

  update public.profiles
  set
    organization_id = new_organization_id,
    updated_at = now()
  where id = new.id;

  select plan.id
  into starter_plan_id
  from public.subscription_plans as plan
  where plan.code = 'starter'
    and plan.is_active = true
  limit 1;

  if starter_plan_id is null then
    raise exception 'The active Starter subscription plan is missing.';
  end if;

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

-- Verification: exactly one enabled non-internal trigger should remain.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
order by trigger_name;
