-- Flowtix Phase 1.3: unified ownership and permission foundation.
-- Adds organization-membership ownership without removing legacy auth.users owner fields.

create extension if not exists pgcrypto;

alter table public.contacts
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

alter table public.companies
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

alter table public.opportunities
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

alter table public.contact_tasks
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

alter table public.calendar_events
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

alter table public.calls
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

alter table public.campaigns
  add column if not exists owner_membership_id uuid references public.organization_members(id) on delete set null;

create index if not exists contacts_owner_membership_idx
  on public.contacts (organization_id, owner_membership_id);
create index if not exists companies_owner_membership_idx
  on public.companies (organization_id, owner_membership_id);
create index if not exists opportunities_owner_membership_idx
  on public.opportunities (organization_id, owner_membership_id);
create index if not exists contact_tasks_owner_membership_idx
  on public.contact_tasks (organization_id, owner_membership_id);
create index if not exists calendar_events_owner_membership_idx
  on public.calendar_events (organization_id, owner_membership_id, starts_at);
create index if not exists calls_owner_membership_idx
  on public.calls (organization_id, owner_membership_id, started_at);
create index if not exists campaigns_owner_membership_idx
  on public.campaigns (organization_id, owner_membership_id);

create or replace function public.is_active_organization_member(
  target_organization_id uuid,
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.id = target_membership_id
      and member.organization_id = target_organization_id
      and member.status = 'active'
  );
$$;

create or replace function public.current_organization_membership_id(
  target_organization_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member.id
  from public.organization_members member
  where member.organization_id = target_organization_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;
$$;

create or replace function public.can_manage_organization_assignments(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'admin', 'manager')
  );
$$;

create or replace function public.can_access_owned_record(
  target_organization_id uuid,
  target_owner_membership_id uuid,
  target_legacy_owner_id uuid,
  target_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role in ('owner', 'admin', 'manager')
        or target_owner_membership_id = member.id
        or target_legacy_owner_id = auth.uid()
        or target_created_by = auth.uid()
        or (target_owner_membership_id is null and target_legacy_owner_id is null)
      )
  );
$$;

-- Backfill membership ownership from legacy owner_id, then creator, while preserving legacy columns.
update public.contacts record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = coalesce(
    case
      when (record.metadata ->> 'owner_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (record.metadata ->> 'owner_id')::uuid
      else null
    end,
    record.created_by
  );

update public.companies record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = coalesce(record.owner_id, record.created_by);

update public.opportunities record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = coalesce(record.owner_id, record.created_by);

update public.calendar_events record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = coalesce(record.owner_id, record.created_by);

update public.calls record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = record.created_by;

update public.campaigns record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = record.created_by;

-- Validate ownership assignments at the database boundary.
create or replace function public.validate_owner_membership_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_membership_id is not null and not public.is_active_organization_member(
    new.organization_id,
    new.owner_membership_id
  ) then
    raise exception 'Assigned owner must be an active member of the same organization.';
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'contacts',
    'companies',
    'opportunities',
    'contact_tasks',
    'calendar_events',
    'calls',
    'campaigns'
  ]
  loop
    execute format('drop trigger if exists validate_%I_owner_membership on public.%I', table_name, table_name);
    execute format(
      'create trigger validate_%I_owner_membership before insert or update of organization_id, owner_membership_id on public.%I for each row execute function public.validate_owner_membership_assignment()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- Contacts are the first module moved onto scoped ownership policies.
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;
drop policy if exists contacts_select_org_members on public.contacts;
drop policy if exists contacts_select_members on public.contacts;
drop policy if exists contacts_update_org_writers on public.contacts;
drop policy if exists contacts_update_members on public.contacts;
drop policy if exists contacts_delete_org_admins on public.contacts;
drop policy if exists contacts_delete_members on public.contacts;

drop policy if exists contacts_select_scoped on public.contacts;
create policy contacts_select_scoped
on public.contacts for select
to authenticated
using (
  public.can_access_owned_record(
    contacts.organization_id,
    contacts.owner_membership_id,
    case
      when (contacts.metadata ->> 'owner_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (contacts.metadata ->> 'owner_id')::uuid
      else null
    end,
    contacts.created_by
  )
);

drop policy if exists contacts_insert_scoped on public.contacts;
create policy contacts_insert_scoped
on public.contacts for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.organization_members member
    where member.organization_id = contacts.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(contacts.organization_id)
    or owner_membership_id = public.current_organization_membership_id(contacts.organization_id)
  )
);

drop policy if exists contacts_update_scoped on public.contacts;
create policy contacts_update_scoped
on public.contacts for update
to authenticated
using (
  public.can_access_owned_record(
    contacts.organization_id,
    contacts.owner_membership_id,
    case
      when (contacts.metadata ->> 'owner_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (contacts.metadata ->> 'owner_id')::uuid
      else null
    end,
    contacts.created_by
  )
)
with check (
  public.can_access_owned_record(
    contacts.organization_id,
    contacts.owner_membership_id,
    case
      when (contacts.metadata ->> 'owner_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (contacts.metadata ->> 'owner_id')::uuid
      else null
    end,
    contacts.created_by
  )
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(contacts.organization_id)
    or owner_membership_id = public.current_organization_membership_id(contacts.organization_id)
  )
);

drop policy if exists contacts_delete_scoped on public.contacts;
create policy contacts_delete_scoped
on public.contacts for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = contacts.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('owner', 'admin', 'manager')
  )
);

grant execute on function public.is_active_organization_member(uuid, uuid) to authenticated;
grant execute on function public.current_organization_membership_id(uuid) to authenticated;
grant execute on function public.can_manage_organization_assignments(uuid) to authenticated;
grant execute on function public.can_access_owned_record(uuid, uuid, uuid, uuid) to authenticated;

--- Return the active membership primary key and user ID so application
-- authorization can use membership-scoped ownership.
drop function if exists public.get_current_organization_membership();

create function public.get_current_organization_membership()
returns table (
  membership_id uuid,
  organization_id uuid,
  user_id uuid,
  role public.member_role
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

  -- Prefer the organization currently selected in profiles.organization_id.
  -- If it is no longer valid, fall back to the user's oldest active membership.
  select member.organization_id
  into v_organization_id
  from public.organization_members as member
  left join public.profiles as profile
    on profile.id = v_user_id
  where member.user_id = v_user_id
    and coalesce(member.status::text, 'active') = 'active'
    and member.role::text in (
      'owner',
      'admin',
      'manager',
      'agent'
    )
  order by
    case
      when member.organization_id = profile.organization_id
        then 0
      else 1
    end,
    member.created_at asc
  limit 1;

  if v_organization_id is null then
    return;
  end if;

  -- Repair the selected organization when the profile points to an invalid
  -- or inactive workspace.
  update public.profiles as profile
  set
    organization_id = v_organization_id,
    updated_at = now()
  where profile.id = v_user_id
    and profile.organization_id
      is distinct from v_organization_id;

  return query
  select
    member.id::uuid as membership_id,
    member.organization_id::uuid,
    member.user_id::uuid,
    member.role::public.member_role
  from public.organization_members as member
  where member.user_id = v_user_id
    and member.organization_id = v_organization_id
    and coalesce(member.status::text, 'active') = 'active'
    and member.role::text in (
      'owner',
      'admin',
      'manager',
      'agent'
    )
  order by member.created_at asc
  limit 1;
end;
$function$;

revoke all
on function public.get_current_organization_membership()
from public;

grant execute
on function public.get_current_organization_membership()
to authenticated, service_role;
