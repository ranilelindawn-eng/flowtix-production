-- Flowtix Platform Admin — Feature Flags Management
--
-- Extends the existing platform_feature_flags and
-- organization_feature_flag_overrides tables.
--
-- Feature flags remain operational controls and do not replace or grant
-- subscription-plan entitlements.

begin;

alter table public.platform_feature_flags
  add column if not exists updated_by uuid
    references auth.users(id) on delete set null;

create index if not exists organization_feature_flag_overrides_flag_idx
  on public.organization_feature_flag_overrides(flag_key, updated_at desc);

create index if not exists organization_feature_flag_overrides_org_idx
  on public.organization_feature_flag_overrides(organization_id, updated_at desc);

-- Existing authenticated read policies remain available for future
-- customer-side runtime consumers. No direct authenticated write policy is
-- created. All platform mutations go through staff-guarded RPCs.

create or replace function public.platform_can_manage_feature_flags()
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
        and platform_user.role in (
          'platform_owner',
          'platform_admin',
          'developer'
        )
    );
$function$;

create or replace function public.platform_feature_flag_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_manage_feature_flags() then
    raise exception 'PLATFORM_FEATURE_FLAGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'flagKey', flag.flag_key,
        'name', flag.name,
        'description', flag.description,
        'defaultEnabled', flag.default_enabled,
        'rolloutPercentage', flag.rollout_percentage,
        'overrideCount',
          (
            select count(*)
            from public.organization_feature_flag_overrides override_row
            where override_row.flag_key = flag.flag_key
          ),
        'enabledOverrideCount',
          (
            select count(*)
            from public.organization_feature_flag_overrides override_row
            where override_row.flag_key = flag.flag_key
              and override_row.enabled = true
          ),
        'disabledOverrideCount',
          (
            select count(*)
            from public.organization_feature_flag_overrides override_row
            where override_row.flag_key = flag.flag_key
              and override_row.enabled = false
          ),
        'updatedAt', flag.updated_at,
        'updatedBy', flag.updated_by
      )
      order by flag.name asc
    ),
    '[]'::jsonb
  )
  into result
  from public.platform_feature_flags flag;

  return result;
end;
$function$;

create or replace function public.platform_feature_flag_detail(
  p_flag_key text,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  flag_row public.platform_feature_flags%rowtype;
  normalized_search text :=
    nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if not public.platform_can_manage_feature_flags() then
    raise exception 'PLATFORM_FEATURE_FLAGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select flag.*
  into flag_row
  from public.platform_feature_flags flag
  where flag.flag_key = p_flag_key;

  if flag_row.flag_key is null then
    return null;
  end if;

  with filtered_overrides as (
    select
      override_row.organization_id,
      organization.name as organization_name,
      coalesce(organization.status, 'active') as organization_status,
      override_row.enabled,
      override_row.rollout_percentage,
      override_row.updated_by,
      account.email as updated_by_email,
      override_row.updated_at
    from public.organization_feature_flag_overrides override_row
    join public.organizations organization
      on organization.id = override_row.organization_id
    left join auth.users account
      on account.id = override_row.updated_by
    where override_row.flag_key = flag_row.flag_key
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or organization.id::text ilike '%' || normalized_search || '%'
      )
  ),
  page_rows as (
    select *
    from filtered_overrides
    order by organization_name asc
    limit safe_limit
    offset safe_offset
  )
  select jsonb_build_object(
    'flagKey', flag_row.flag_key,
    'name', flag_row.name,
    'description', flag_row.description,
    'defaultEnabled', flag_row.default_enabled,
    'rolloutPercentage', flag_row.rollout_percentage,
    'overrideCount',
      (
        select count(*)
        from public.organization_feature_flag_overrides override_row
        where override_row.flag_key = flag_row.flag_key
      ),
    'enabledOverrideCount',
      (
        select count(*)
        from public.organization_feature_flag_overrides override_row
        where override_row.flag_key = flag_row.flag_key
          and override_row.enabled = true
      ),
    'disabledOverrideCount',
      (
        select count(*)
        from public.organization_feature_flag_overrides override_row
        where override_row.flag_key = flag_row.flag_key
          and override_row.enabled = false
      ),
    'updatedAt', flag_row.updated_at,
    'updatedBy', flag_row.updated_by,
    'overrides',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'organizationId', row_item.organization_id,
              'organizationName', row_item.organization_name,
              'organizationStatus', row_item.organization_status,
              'enabled', row_item.enabled,
              'rolloutPercentage', row_item.rollout_percentage,
              'updatedBy', row_item.updated_by,
              'updatedByEmail', row_item.updated_by_email,
              'updatedAt', row_item.updated_at
            )
            order by row_item.organization_name asc
          )
          from page_rows row_item
        ),
        '[]'::jsonb
      ),
    'overrideTotal', (select count(*) from filtered_overrides),
    'limit', safe_limit,
    'offset', safe_offset
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_update_feature_flag(
  p_flag_key text,
  p_default_enabled boolean,
  p_rollout_percentage integer,
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
  flag_row public.platform_feature_flags%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'developer'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_FEATURE_FLAGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if p_rollout_percentage < 0 or p_rollout_percentage > 100 then
    raise exception 'INVALID_FEATURE_FLAG_ROLLOUT'
      using errcode = '22023';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'FEATURE_FLAG_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select flag.*
  into flag_row
  from public.platform_feature_flags flag
  where flag.flag_key = p_flag_key
  for update;

  if flag_row.flag_key is null then
    raise exception 'FEATURE_FLAG_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  update public.platform_feature_flags
  set
    default_enabled = p_default_enabled,
    rollout_percentage = p_rollout_percentage,
    updated_by = actor.user_id,
    updated_at = pg_catalog.now()
  where flag_key = flag_row.flag_key;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'feature_flags.global_updated',
    'feature_flag',
    flag_row.flag_key,
    normalized_reason,
    jsonb_build_object(
      'defaultEnabled', flag_row.default_enabled,
      'rolloutPercentage', flag_row.rollout_percentage
    ),
    jsonb_build_object(
      'defaultEnabled', p_default_enabled,
      'rolloutPercentage', p_rollout_percentage
    ),
    jsonb_build_object(
      'entitlementsUnchanged', true
    )
  );

  return true;
end;
$function$;

create or replace function public.platform_set_feature_flag_override(
  p_flag_key text,
  p_organization_id uuid,
  p_enabled boolean,
  p_rollout_percentage integer default null,
  p_reason text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  previous_override public.organization_feature_flag_overrides%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'developer'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_FEATURE_FLAGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if p_rollout_percentage is not null
     and (p_rollout_percentage < 0 or p_rollout_percentage > 100) then
    raise exception 'INVALID_FEATURE_FLAG_ROLLOUT'
      using errcode = '22023';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'FEATURE_FLAG_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.platform_feature_flags flag
    where flag.flag_key = p_flag_key
  ) then
    raise exception 'FEATURE_FLAG_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
  ) then
    raise exception 'ORGANIZATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select override_row.*
  into previous_override
  from public.organization_feature_flag_overrides override_row
  where override_row.organization_id = p_organization_id
    and override_row.flag_key = p_flag_key;

  insert into public.organization_feature_flag_overrides (
    organization_id,
    flag_key,
    enabled,
    rollout_percentage,
    updated_by,
    updated_at
  )
  values (
    p_organization_id,
    p_flag_key,
    p_enabled,
    p_rollout_percentage,
    actor.user_id,
    pg_catalog.now()
  )
  on conflict (organization_id, flag_key)
  do update set
    enabled = excluded.enabled,
    rollout_percentage = excluded.rollout_percentage,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

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
    'feature_flags.organization_override_set',
    'feature_flag_override',
    p_flag_key || ':' || p_organization_id::text,
    p_organization_id,
    normalized_reason,
    case
      when previous_override.organization_id is null then null
      else jsonb_build_object(
        'enabled', previous_override.enabled,
        'rolloutPercentage', previous_override.rollout_percentage
      )
    end,
    jsonb_build_object(
      'enabled', p_enabled,
      'rolloutPercentage', p_rollout_percentage
    ),
    jsonb_build_object(
      'flagKey', p_flag_key,
      'entitlementsUnchanged', true
    )
  );

  return true;
end;
$function$;

create or replace function public.platform_remove_feature_flag_override(
  p_flag_key text,
  p_organization_id uuid,
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
  previous_override public.organization_feature_flag_overrides%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'developer'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_FEATURE_FLAGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'FEATURE_FLAG_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select override_row.*
  into previous_override
  from public.organization_feature_flag_overrides override_row
  where override_row.organization_id = p_organization_id
    and override_row.flag_key = p_flag_key
  for update;

  if previous_override.organization_id is null then
    return true;
  end if;

  delete from public.organization_feature_flag_overrides
  where organization_id = p_organization_id
    and flag_key = p_flag_key;

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
    'feature_flags.organization_override_removed',
    'feature_flag_override',
    p_flag_key || ':' || p_organization_id::text,
    p_organization_id,
    normalized_reason,
    jsonb_build_object(
      'enabled', previous_override.enabled,
      'rolloutPercentage', previous_override.rollout_percentage
    ),
    null,
    jsonb_build_object(
      'flagKey', p_flag_key,
      'globalConfigurationRestored', true,
      'entitlementsUnchanged', true
    )
  );

  return true;
end;
$function$;

create or replace function public.resolve_feature_flag(
  p_flag_key text,
  p_organization_id uuid
)
returns table (
  flag_key text,
  enabled boolean,
  rollout_percentage integer,
  source text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  flag_row public.platform_feature_flags%rowtype;
  override_row public.organization_feature_flag_overrides%rowtype;
  effective_enabled boolean;
  effective_rollout integer;
  effective_source text;
  organization_bucket integer;
begin
  if auth.role() <> 'service_role'
     and not public.platform_can_manage_feature_flags()
     and not public.is_organization_member(p_organization_id) then
    raise exception 'FEATURE_FLAG_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select flag.*
  into flag_row
  from public.platform_feature_flags flag
  where flag.flag_key = p_flag_key;

  if flag_row.flag_key is null then
    return;
  end if;

  select override_item.*
  into override_row
  from public.organization_feature_flag_overrides override_item
  where override_item.organization_id = p_organization_id
    and override_item.flag_key = p_flag_key;

  if override_row.organization_id is not null then
    effective_enabled := override_row.enabled;
    effective_rollout := coalesce(
      override_row.rollout_percentage,
      flag_row.rollout_percentage
    );
    effective_source := 'organization_override';
  else
    effective_enabled := flag_row.default_enabled;
    effective_rollout := flag_row.rollout_percentage;
    effective_source := 'platform_default';
  end if;

  if not effective_enabled or effective_rollout <= 0 then
    effective_enabled := false;
  elsif effective_rollout < 100 then
    organization_bucket := (
      (
        pg_catalog.hashtextextended(
          p_organization_id::text || ':' || p_flag_key,
          0
        ) % 100
      ) + 100
    ) % 100;

    effective_enabled := organization_bucket < effective_rollout;
  end if;

  return query
  select
    flag_row.flag_key::text,
    effective_enabled,
    effective_rollout,
    effective_source;
end;
$function$;

revoke all on function public.platform_can_manage_feature_flags()
from public, anon;

revoke all on function public.platform_feature_flag_directory()
from public, anon;

revoke all on function public.platform_feature_flag_detail(
  text,
  text,
  integer,
  integer
)
from public, anon;

revoke all on function public.platform_update_feature_flag(
  text,
  boolean,
  integer,
  text
)
from public, anon;

revoke all on function public.platform_set_feature_flag_override(
  text,
  uuid,
  boolean,
  integer,
  text
)
from public, anon;

revoke all on function public.platform_remove_feature_flag_override(
  text,
  uuid,
  text
)
from public, anon;

revoke all on function public.resolve_feature_flag(text,uuid)
from public, anon;

grant execute on function public.platform_can_manage_feature_flags()
to authenticated;

grant execute on function public.platform_feature_flag_directory()
to authenticated;

grant execute on function public.platform_feature_flag_detail(
  text,
  text,
  integer,
  integer
)
to authenticated;

grant execute on function public.platform_update_feature_flag(
  text,
  boolean,
  integer,
  text
)
to authenticated;

grant execute on function public.platform_set_feature_flag_override(
  text,
  uuid,
  boolean,
  integer,
  text
)
to authenticated;

grant execute on function public.platform_remove_feature_flag_override(
  text,
  uuid,
  text
)
to authenticated;

grant execute on function public.resolve_feature_flag(text,uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
