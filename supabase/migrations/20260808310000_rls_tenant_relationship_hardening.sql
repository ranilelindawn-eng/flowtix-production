begin;

-- Canonical tenant authorization helpers. These helpers are referenced by
-- historical policies but previously lived only in supabase/policies.sql,
-- which is not applied by `supabase db push`.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null
    and org_id is not null
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = org_id
        and om.user_id = auth.uid()
        and coalesce(om.status, 'active') = 'active'
    );
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null
    and org_id is not null
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = org_id
        and om.user_id = auth.uid()
        and coalesce(om.status, 'active') = 'active'
        and om.role::text in ('owner', 'admin')
    );
$$;

create or replace function public.is_org_writer(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null
    and org_id is not null
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = org_id
        and om.user_id = auth.uid()
        and coalesce(om.status, 'active') = 'active'
        and om.role::text in ('owner', 'admin', 'manager', 'supervisor', 'agent')
    );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_writer(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
grant execute on function public.is_org_writer(uuid) to authenticated, service_role;

-- Bind custom role assignments to one organization. The trigger keeps legacy
-- inserts compatible while preventing membership/role cross-tenant joins.
alter table public.organization_member_roles
  add column if not exists organization_id uuid;

update public.organization_member_roles assignment
set organization_id = membership.organization_id
from public.organization_members membership
where membership.id = assignment.membership_id
  and assignment.organization_id is null;

do $$
begin
  if exists (
    select 1
    from public.organization_member_roles assignment
    join public.organization_members membership on membership.id = assignment.membership_id
    join public.organization_roles role_record on role_record.id = assignment.role_id
    where membership.organization_id <> role_record.organization_id
  ) then
    raise exception 'Cross-organization custom role assignments must be corrected before applying this migration';
  end if;
end;
$$;

create or replace function public.enforce_organization_member_role_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  membership_org uuid;
  role_org uuid;
begin
  select organization_id
  into membership_org
  from public.organization_members
  where id = new.membership_id;

  select organization_id
  into role_org
  from public.organization_roles
  where id = new.role_id;

  if membership_org is null or role_org is null then
    raise exception 'Membership and role must exist';
  end if;

  if membership_org <> role_org then
    raise exception 'Membership and role must belong to the same organization';
  end if;

  if new.organization_id is not null and new.organization_id <> membership_org then
    raise exception 'Role assignment organization does not match its membership';
  end if;

  new.organization_id := membership_org;
  return new;
end;
$$;

revoke all on function public.enforce_organization_member_role_tenant() from public, anon, authenticated;
grant execute on function public.enforce_organization_member_role_tenant() to service_role;

drop trigger if exists organization_member_roles_tenant_guard on public.organization_member_roles;
create trigger organization_member_roles_tenant_guard
before insert or update of membership_id, role_id, organization_id
on public.organization_member_roles
for each row execute function public.enforce_organization_member_role_tenant();

alter table public.organization_member_roles
  alter column organization_id set not null;

create index if not exists organization_member_roles_org_idx
  on public.organization_member_roles (organization_id, membership_id);

-- The table had RLS enabled but no policies. Add explicit tenant-scoped access.
alter table public.organization_member_roles enable row level security;

drop policy if exists organization_member_roles_select_member on public.organization_member_roles;
create policy organization_member_roles_select_member
on public.organization_member_roles
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists organization_member_roles_insert_admin on public.organization_member_roles;
create policy organization_member_roles_insert_admin
on public.organization_member_roles
for insert
to authenticated
with check (
  public.is_org_admin(organization_id)
  and assigned_by = auth.uid()
);

drop policy if exists organization_member_roles_update_admin on public.organization_member_roles;
create policy organization_member_roles_update_admin
on public.organization_member_roles
for update
to authenticated
using (public.is_org_admin(organization_id))
with check (
  public.is_org_admin(organization_id)
  and assigned_by = auth.uid()
);

drop policy if exists organization_member_roles_delete_admin on public.organization_member_roles;
create policy organization_member_roles_delete_admin
on public.organization_member_roles
for delete
to authenticated
using (public.is_org_admin(organization_id));

-- Replace custom-role policies that did not require active membership.
drop policy if exists "members read custom roles" on public.organization_roles;
drop policy if exists "admins manage custom roles" on public.organization_roles;

create policy organization_roles_select_active_member
on public.organization_roles
for select
to authenticated
using (public.is_org_member(organization_id));

create policy organization_roles_insert_admin
on public.organization_roles
for insert
to authenticated
with check (
  public.is_org_admin(organization_id)
  and (created_by is null or created_by = auth.uid())
);

create policy organization_roles_update_admin
on public.organization_roles
for update
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy organization_roles_delete_admin
on public.organization_roles
for delete
to authenticated
using (
  public.is_org_admin(organization_id)
  and not is_system
);

-- Service-role-only integrity report used by the production validation phase.
create or replace function public.database_rls_integrity_report()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  tables_without_rls jsonb;
  tenant_tables_without_policies jsonb;
  permissive_public_functions jsonb;
  cross_tenant_role_assignments bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select coalesce(jsonb_agg(format('%I.%I', n.nspname, c.relname) order by c.relname), '[]'::jsonb)
  into tables_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and exists (
      select 1
      from pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'organization_id'
        and not a.attisdropped
    )
    and not c.relrowsecurity;

  select coalesce(jsonb_agg(format('%I.%I', n.nspname, c.relname) order by c.relname), '[]'::jsonb)
  into tenant_tables_without_policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and exists (
      select 1
      from pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'organization_id'
        and not a.attisdropped
    )
    and c.relrowsecurity
    and not exists (
      select 1
      from pg_policy p
      where p.polrelid = c.oid
    );

  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
  into permissive_public_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('public', p.oid, 'EXECUTE');

  select count(*)
  into cross_tenant_role_assignments
  from public.organization_member_roles assignment
  join public.organization_members membership on membership.id = assignment.membership_id
  join public.organization_roles role_record on role_record.id = assignment.role_id
  where assignment.organization_id <> membership.organization_id
     or assignment.organization_id <> role_record.organization_id;

  return jsonb_build_object(
    'checkedAt', now(),
    'tablesWithoutRls', tables_without_rls,
    'tenantTablesWithoutPolicies', tenant_tables_without_policies,
    'securityDefinerFunctionsExecutableByPublic', permissive_public_functions,
    'crossTenantRoleAssignments', cross_tenant_role_assignments,
    'healthy',
      jsonb_array_length(tables_without_rls) = 0
      and jsonb_array_length(tenant_tables_without_policies) = 0
      and jsonb_array_length(permissive_public_functions) = 0
      and cross_tenant_role_assignments = 0
  );
end;
$$;

revoke all on function public.database_rls_integrity_report() from public, anon, authenticated;
grant execute on function public.database_rls_integrity_report() to service_role;

commit;
