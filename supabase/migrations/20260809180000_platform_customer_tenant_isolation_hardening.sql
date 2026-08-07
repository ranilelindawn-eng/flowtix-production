-- Flowtix Phase 2.3 — Platform ↔ Customer Tenant Isolation Hardening
--
-- Goal:
-- 1. Active Flowtix Platform identities are Platform-only.
-- 2. A stale/historical organization_members row cannot grant a Platform staff
--    account customer-workspace access through RLS or customer SECURITY DEFINER RPCs.
-- 3. Customer organization A remains isolated from customer organization B.
-- 4. Support access continues only through the dedicated audited Platform
--    support-session RPCs introduced in the Support Workspace phase.
--
-- This migration does NOT delete organization memberships and does NOT weaken
-- customer RLS. Historical staff/customer overlaps remain visible for audit,
-- but they cease to authorize customer data access while platform_users.is_active=true.

begin;

create or replace function public.is_active_platform_identity()
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
    );
$function$;

revoke all on function public.is_active_platform_identity()
from public, anon;

grant execute on function public.is_active_platform_identity()
to authenticated, service_role;

comment on function public.is_active_platform_identity() is
  'Returns true when auth.uid() has an active Flowtix Platform identity. Active Platform staff are intentionally excluded from customer-workspace authorization.';

-- Canonical customer membership helpers.
-- All customer-facing SECURITY DEFINER RPCs that use these helpers now reject
-- active Platform staff even if an old organization_members row still exists.

create or replace function public.is_organization_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and target_organization_id is not null
    and not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.organization_id = target_organization_id
        and member.user_id = auth.uid()
        and coalesce(member.status::text, 'active') = 'active'
        and coalesce(organization.status, 'active') = 'active'
    );
$function$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and org_id is not null
    and not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.organization_id = org_id
        and member.user_id = auth.uid()
        and coalesce(member.status::text, 'active') = 'active'
        and coalesce(organization.status, 'active') = 'active'
    );
$function$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and org_id is not null
    and not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.organization_id = org_id
        and member.user_id = auth.uid()
        and coalesce(member.status::text, 'active') = 'active'
        and member.role::text in ('owner', 'admin')
        and coalesce(organization.status, 'active') = 'active'
    );
$function$;

create or replace function public.is_org_writer(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and org_id is not null
    and not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.organization_id = org_id
        and member.user_id = auth.uid()
        and coalesce(member.status::text, 'active') = 'active'
        and member.role::text in ('owner', 'admin', 'manager', 'agent')
        and coalesce(organization.status, 'active') = 'active'
    );
$function$;

create or replace function public.organization_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select member.role::text
  from public.organization_members member
  join public.organizations organization
    on organization.id = member.organization_id
  where auth.uid() is not null
    and not public.is_active_platform_identity()
    and member.organization_id = target_org
    and member.user_id = auth.uid()
    and coalesce(member.status::text, 'active') = 'active'
    and coalesce(organization.status, 'active') = 'active'
  limit 1;
$function$;

-- Platform staff cannot change profiles.organization_id to enter a customer
-- workspace through the active-organization selector.
create or replace function public.set_active_organization(
  target_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.is_active_platform_identity() then
    raise exception 'PLATFORM_IDENTITY_CUSTOMER_WORKSPACE_DENIED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.user_id = auth.uid()
      and member.organization_id = target_organization_id
      and coalesce(member.status::text, 'active') = 'active'
      and coalesce(organization.status, 'active') = 'active'
  ) then
    raise exception 'You are not an active member of an active organization';
  end if;

  update public.profiles
  set
    organization_id = target_organization_id,
    updated_at = pg_catalog.now()
  where id = auth.uid();

  if not found then
    raise exception 'User profile not found';
  end if;

  return true;
end;
$function$;

-- Customer workspace membership resolution returns zero rows to active Platform
-- staff. This protects all application code that resolves the active workspace.
create or replace function public.get_current_organization_membership()
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

  if public.is_active_platform_identity() then
    return;
  end if;

  select member.organization_id
  into v_organization_id
  from public.organization_members member
  join public.organizations organization
    on organization.id = member.organization_id
  left join public.profiles profile
    on profile.id = v_user_id
  where member.user_id = v_user_id
    and coalesce(member.status::text, 'active') = 'active'
    and member.role::text in ('owner', 'admin', 'manager', 'agent')
    and coalesce(organization.status, 'active') = 'active'
  order by
    case
      when member.organization_id = profile.organization_id then 0
      else 1
    end,
    member.created_at asc
  limit 1;

  if v_organization_id is null then
    return;
  end if;

  update public.profiles profile
  set
    organization_id = v_organization_id,
    updated_at = pg_catalog.now()
  where profile.id = v_user_id
    and profile.organization_id is distinct from v_organization_id;

  return query
  select
    member.id::uuid,
    member.organization_id::uuid,
    member.user_id::uuid,
    member.role::public.member_role
  from public.organization_members member
  join public.organizations organization
    on organization.id = member.organization_id
  where member.user_id = v_user_id
    and member.organization_id = v_organization_id
    and coalesce(member.status::text, 'active') = 'active'
    and member.role::text in ('owner', 'admin', 'manager', 'agent')
    and coalesce(organization.status, 'active') = 'active'
  order by member.created_at asc
  limit 1;
end;
$function$;

-- Team-list SECURITY DEFINER RPC previously selected organization_members
-- directly. Make the customer/Platform split explicit here too.
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
    select membership.organization_id
    from public.organization_members membership
    join public.organizations organization
      on organization.id = membership.organization_id
    left join public.profiles profile
      on profile.id = auth.uid()
    where auth.uid() is not null
      and not public.is_active_platform_identity()
      and membership.user_id = auth.uid()
      and coalesce(membership.status::text, 'active') = 'active'
      and membership.role::text in ('owner', 'admin', 'manager', 'agent')
      and coalesce(organization.status, 'active') = 'active'
    order by
      case
        when membership.organization_id = profile.organization_id then 0
        else 1
      end,
      membership.created_at asc
    limit 1
  )
  select
    membership.id,
    membership.organization_id,
    membership.user_id,
    membership.role::text,
    membership.created_at,
    profile.full_name,
    coalesce(profile.email, account.email) as email,
    profile.avatar_url
  from public.organization_members membership
  join current_membership
    on current_membership.organization_id = membership.organization_id
  left join public.profiles profile
    on profile.id = membership.user_id
  left join auth.users account
    on account.id = membership.user_id
  where coalesce(membership.status::text, 'active') = 'active'
    and membership.role::text in ('owner', 'admin', 'manager', 'agent')
  order by membership.created_at asc;
$function$;

-- Prevent an active Platform account from gaining a new active customer
-- membership through invitation acceptance, manual team operations, or any
-- other authenticated insert/update path. Existing overlapping rows are not
-- deleted; their authorization power is removed by the helpers/policy guard.
create or replace function public.prevent_platform_customer_membership_activation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if coalesce(new.status::text, 'active') <> 'active' then
    return new;
  end if;

  if exists (
    select 1
    from public.platform_users platform_user
    where platform_user.user_id = new.user_id
      and platform_user.is_active = true
  ) then
    raise exception 'ACTIVE_PLATFORM_USER_CANNOT_JOIN_CUSTOMER_WORKSPACE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.prevent_platform_customer_membership_activation()
from public, anon, authenticated;

drop trigger if exists prevent_platform_customer_membership_activation_trigger
on public.organization_members;

create trigger prevent_platform_customer_membership_activation_trigger
before insert or update of user_id, status
on public.organization_members
for each row
execute function public.prevent_platform_customer_membership_activation();

-- Historical RLS policies were written over several development phases.
-- Some use canonical helpers and some contain direct organization_members
-- EXISTS checks. Wrap every current customer-membership-dependent policy with
-- the same Platform deny boundary without rewriting its original tenant/role
-- expression.
do $block$
declare
  policy_row record;
  using_expression text;
  check_expression text;
  alter_sql text;
begin
  for policy_row in
    select
      policy.oid,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      policy.polname as policy_name,
      policy.polcmd,
      pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
      pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
    from pg_policy policy
    join pg_class relation
      on relation.oid = policy.polrelid
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname not like 'platform\_%' escape '\'
      and (
        coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%organization_members%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%organization_members%'
        or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_org_member%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_org_member%'
        or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_org_admin%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_org_admin%'
        or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_org_writer%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_org_writer%'
        or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_organization_member%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_organization_member%'
        or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%organization_role%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%organization_role%'
      )
      and (
        coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') not ilike '%is_active_platform_identity%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') not ilike '%is_active_platform_identity%'
      )
  loop
    using_expression := policy_row.using_expression;
    check_expression := policy_row.check_expression;

    alter_sql := format(
      'alter policy %I on %I.%I',
      policy_row.policy_name,
      policy_row.schema_name,
      policy_row.table_name
    );

    if using_expression is not null
       and using_expression not ilike '%is_active_platform_identity%' then
      alter_sql := alter_sql || format(
        ' using ((not public.is_active_platform_identity()) and (%s))',
        using_expression
      );
    end if;

    if check_expression is not null
       and check_expression not ilike '%is_active_platform_identity%' then
      alter_sql := alter_sql || format(
        ' with check ((not public.is_active_platform_identity()) and (%s))',
        check_expression
      );
    end if;

    execute alter_sql;
  end loop;
end;
$block$;

-- Platform Owner/Admin/Developer diagnostic used for acceptance testing.
create or replace function public.platform_tenant_isolation_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  overlapping_active_memberships bigint;
  customer_membership_policies bigint;
  unguarded_customer_policies bigint;
  active_platform_users bigint;
  active_customer_organizations bigint;
begin
  if not exists (
    select 1
    from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in (
        'platform_owner',
        'platform_admin',
        'developer'
      )
  ) then
    raise exception 'PLATFORM_TENANT_ISOLATION_REPORT_DENIED'
      using errcode = '42501';
  end if;

  select count(*)
  into overlapping_active_memberships
  from public.organization_members member
  join public.platform_users platform_user
    on platform_user.user_id = member.user_id
  where platform_user.is_active = true
    and coalesce(member.status::text, 'active') = 'active';

  select count(*)
  into customer_membership_policies
  from pg_policy policy
  join pg_class relation
    on relation.oid = policy.polrelid
  join pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname not like 'platform\_%' escape '\'
    and (
      coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%organization_members%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%organization_members%'
      or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_org_%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_org_%'
      or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_organization_member%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_organization_member%'
      or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%organization_role%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%organization_role%'
    );

  select count(*)
  into unguarded_customer_policies
  from pg_policy policy
  join pg_class relation
    on relation.oid = policy.polrelid
  join pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname not like 'platform\_%' escape '\'
    and (
      coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%organization_members%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%organization_members%'
      or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_org_%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_org_%'
      or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%is_organization_member%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%is_organization_member%'
      or coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%organization_role%'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%organization_role%'
    )
    and (
      (
        policy.polqual is not null
        and pg_get_expr(policy.polqual, policy.polrelid)
          not ilike '%is_active_platform_identity%'
      )
      or (
        policy.polwithcheck is not null
        and pg_get_expr(policy.polwithcheck, policy.polrelid)
          not ilike '%is_active_platform_identity%'
      )
    );

  select count(*)
  into active_platform_users
  from public.platform_users platform_user
  where platform_user.is_active = true;

  select count(*)
  into active_customer_organizations
  from public.organizations organization
  where coalesce(organization.status, 'active') = 'active';

  return jsonb_build_object(
    'checkedAt', pg_catalog.now(),
    'activePlatformUsers', active_platform_users,
    'activeCustomerOrganizations', active_customer_organizations,
    'overlappingActiveMembershipRows', overlapping_active_memberships,
    'customerMembershipDependentPolicies', customer_membership_policies,
    'unguardedCustomerMembershipPolicies', unguarded_customer_policies,
    'platformIdentityDeniedByCustomerHelpers', true,
    'platformIdentityDeniedByActiveOrganizationSelector', true,
    'newActivePlatformCustomerMembershipsBlocked', true,
    'healthy', unguarded_customer_policies = 0
  );
end;
$function$;

revoke all on function public.is_organization_member(uuid)
from public, anon;
revoke all on function public.is_org_member(uuid)
from public, anon;
revoke all on function public.is_org_admin(uuid)
from public, anon;
revoke all on function public.is_org_writer(uuid)
from public, anon;
revoke all on function public.organization_role(uuid)
from public, anon;
revoke all on function public.set_active_organization(uuid)
from public, anon;
revoke all on function public.get_current_organization_membership()
from public, anon;
revoke all on function public.get_current_organization_team_members()
from public, anon;
revoke all on function public.platform_tenant_isolation_report()
from public, anon;

grant execute on function public.is_organization_member(uuid)
to authenticated, service_role;
grant execute on function public.is_org_member(uuid)
to authenticated, service_role;
grant execute on function public.is_org_admin(uuid)
to authenticated, service_role;
grant execute on function public.is_org_writer(uuid)
to authenticated, service_role;
grant execute on function public.organization_role(uuid)
to authenticated, service_role;
grant execute on function public.set_active_organization(uuid)
to authenticated;
grant execute on function public.get_current_organization_membership()
to authenticated, service_role;
grant execute on function public.get_current_organization_team_members()
to authenticated, service_role;
grant execute on function public.platform_tenant_isolation_report()
to authenticated;

notify pgrst, 'reload schema';

commit;
