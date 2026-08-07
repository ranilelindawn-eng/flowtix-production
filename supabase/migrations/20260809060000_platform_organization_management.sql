-- Flowtix Platform Admin — Organization Management
--
-- Adds staff-only organization lifecycle operations.
-- Suspension blocks customer workspace access while preserving the existing
-- PayMongo subscription/payment lifecycle unchanged.
-- Every lifecycle mutation is audit logged.

begin;

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  platform_user_id uuid references public.platform_users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role public.platform_role,
  action text not null,
  resource_type text not null,
  resource_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  reason text,
  previous_state jsonb,
  resulting_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists platform_audit_logs_created_idx
  on public.platform_audit_logs(created_at desc);

create index if not exists platform_audit_logs_org_created_idx
  on public.platform_audit_logs(organization_id, created_at desc);

create index if not exists platform_audit_logs_action_created_idx
  on public.platform_audit_logs(action, created_at desc);

alter table public.platform_audit_logs enable row level security;
revoke all on table public.platform_audit_logs from public, anon, authenticated;
grant all on table public.platform_audit_logs to service_role;

create table if not exists public.organization_platform_suspensions (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  platform_user_id uuid
    references public.platform_users(id) on delete set null,
  actor_user_id uuid
    references auth.users(id) on delete set null,
  reason text not null,
  member_status_snapshot jsonb not null default '{}'::jsonb,
  suspended_at timestamptz not null default pg_catalog.now(),
  reactivated_at timestamptz
);

alter table public.organization_platform_suspensions enable row level security;
revoke all on table public.organization_platform_suspensions
  from public, anon, authenticated;
grant all on table public.organization_platform_suspensions to service_role;

-- Prevent invitation acceptance or any other application path from activating
-- a membership while its organization is suspended/archived.
create or replace function public.enforce_active_organization_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  organization_status text;
begin
  if coalesce(new.status::text, 'active') <> 'active' then
    return new;
  end if;

  select coalesce(organization.status, 'active')
  into organization_status
  from public.organizations organization
  where organization.id = new.organization_id;

  if organization_status is distinct from 'active' then
    raise exception 'ORGANIZATION_NOT_ACTIVE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_active_organization_membership()
from public, anon, authenticated;

drop trigger if exists enforce_active_organization_membership_trigger
on public.organization_members;

create trigger enforce_active_organization_membership_trigger
before insert or update of organization_id, status
on public.organization_members
for each row
execute function public.enforce_active_organization_membership();

-- Staff-only lifecycle mutation. Application permissions map
-- platform.organizations.manage to platform_owner/platform_admin.
create or replace function public.platform_set_organization_status(
  p_organization_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  organization_row public.organizations%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  member_snapshot jsonb := '{}'::jsonb;
  suspension_row public.organization_platform_suspensions%rowtype;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_ORGANIZATION_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'INVALID_ORGANIZATION_STATUS'
      using errcode = '22023';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'ORGANIZATION_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = p_organization_id
  for update;

  if organization_row.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if organization_row.status = 'archived' then
    raise exception 'ARCHIVED_ORGANIZATION_READ_ONLY'
      using errcode = 'P0001';
  end if;

  if organization_row.status = p_status then
    return true;
  end if;

  if p_status = 'suspended' then
    select coalesce(
      jsonb_object_agg(
        member.id::text,
        coalesce(member.status::text, 'active')
      ),
      '{}'::jsonb
    )
    into member_snapshot
    from public.organization_members member
    where member.organization_id = p_organization_id;

    insert into public.organization_platform_suspensions (
      organization_id,
      platform_user_id,
      actor_user_id,
      reason,
      member_status_snapshot,
      suspended_at,
      reactivated_at
    )
    values (
      p_organization_id,
      actor.id,
      actor.user_id,
      normalized_reason,
      member_snapshot,
      pg_catalog.now(),
      null
    )
    on conflict (organization_id)
    do update set
      platform_user_id = excluded.platform_user_id,
      actor_user_id = excluded.actor_user_id,
      reason = excluded.reason,
      member_status_snapshot = excluded.member_status_snapshot,
      suspended_at = excluded.suspended_at,
      reactivated_at = null;

    update public.organizations
    set
      status = 'suspended',
      updated_at = pg_catalog.now()
    where id = p_organization_id;

    update public.organization_members member
    set
      status = 'suspended',
      updated_at = pg_catalog.now()
    where member.organization_id = p_organization_id
      and coalesce(member.status::text, 'active') = 'active';

  else
    select suspension.*
    into suspension_row
    from public.organization_platform_suspensions suspension
    where suspension.organization_id = p_organization_id
    for update;

    update public.organizations
    set
      status = 'active',
      updated_at = pg_catalog.now()
    where id = p_organization_id;

    if suspension_row.organization_id is not null then
      update public.organization_members member
      set
        status = 'active',
        updated_at = pg_catalog.now()
      where member.organization_id = p_organization_id
        and coalesce(member.status::text, 'active') = 'suspended'
        and exists (
          select 1
          from jsonb_each_text(suspension_row.member_status_snapshot) snapshot
          where snapshot.key = member.id::text
            and snapshot.value = 'active'
        );

      update public.organization_platform_suspensions
      set reactivated_at = pg_catalog.now()
      where organization_id = p_organization_id;
    end if;
  end if;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    case
      when p_status = 'suspended'
        then 'organization.suspended'
      else 'organization.reactivated'
    end,
    'organization',
    p_organization_id::text,
    p_organization_id,
    normalized_reason,
    jsonb_build_object(
      'status',
      coalesce(organization_row.status, 'active')
    ),
    jsonb_build_object('status', p_status),
    jsonb_build_object(
      'preservedPayMongoLifecycle', true,
      'memberStatusSnapshotStored', p_status = 'suspended'
    )
  );

  insert into public.organization_lifecycle_events (
    organization_id,
    event_type,
    previous_state,
    resulting_state,
    actor_user_id
  )
  values (
    p_organization_id,
    case
      when p_status = 'suspended'
        then 'platform_suspended'
      else 'platform_reactivated'
    end,
    jsonb_build_object(
      'status',
      coalesce(organization_row.status, 'active'),
      'reason',
      normalized_reason
    ),
    jsonb_build_object(
      'status',
      p_status,
      'reason',
      normalized_reason
    ),
    actor.user_id
  );

  return true;
end;
$function$;

create or replace function public.platform_organization_lifecycle(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'PLATFORM_ORGANIZATION_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', audit.id,
        'eventType', audit.action,
        'reason', audit.reason,
        'previousStatus', audit.previous_state ->> 'status',
        'resultingStatus', audit.resulting_state ->> 'status',
        'actorUserId', audit.actor_user_id,
        'actorRole', audit.actor_role::text,
        'actorEmail', account.email,
        'createdAt', audit.created_at
      )
      order by audit.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.platform_audit_logs audit
  left join auth.users account on account.id = audit.actor_user_id
  where audit.organization_id = p_organization_id
    and audit.resource_type = 'organization';

  return result;
end;
$function$;

revoke all on function public.platform_set_organization_status(uuid, text, text)
from public, anon;
revoke all on function public.platform_organization_lifecycle(uuid)
from public, anon;

grant execute on function public.platform_set_organization_status(uuid, text, text)
to authenticated;
grant execute on function public.platform_organization_lifecycle(uuid)
to authenticated;

-- Defense-in-depth: organization membership helpers now require the workspace
-- itself to be active, not merely the membership row.
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
  where member.organization_id = target_org
    and member.user_id = auth.uid()
    and coalesce(member.status::text, 'active') = 'active'
    and coalesce(organization.status, 'active') = 'active'
  limit 1;
$function$;

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

revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_writer(uuid) from public, anon;
revoke all on function public.organization_role(uuid) from public, anon;
revoke all on function public.set_active_organization(uuid) from public, anon;
revoke all on function public.get_current_organization_membership() from public, anon;

grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_writer(uuid) to authenticated;
grant execute on function public.organization_role(uuid) to authenticated;
grant execute on function public.set_active_organization(uuid) to authenticated;
grant execute on function public.get_current_organization_membership()
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
