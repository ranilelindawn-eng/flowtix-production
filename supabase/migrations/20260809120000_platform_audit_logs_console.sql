-- Flowtix Platform Admin — Audit Logs Console
--
-- Read-only search/detail layer over public.platform_audit_logs.
-- The existing platform audit writers remain authoritative.
-- Audit history cannot be inserted, updated, or deleted by authenticated users.
-- JSON state/metadata is recursively sanitized before being returned.

begin;

create index if not exists platform_audit_logs_actor_created_idx
  on public.platform_audit_logs(actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists platform_audit_logs_role_created_idx
  on public.platform_audit_logs(actor_role, created_at desc)
  where actor_role is not null;

create index if not exists platform_audit_logs_resource_created_idx
  on public.platform_audit_logs(resource_type, created_at desc);

create index if not exists platform_audit_logs_resource_id_idx
  on public.platform_audit_logs(resource_id)
  where resource_id is not null;

-- Keep direct table access unavailable. Platform staff read only through
-- SECURITY DEFINER functions that enforce active platform membership.
revoke all on table public.platform_audit_logs
from public, anon, authenticated;

grant all on table public.platform_audit_logs
to service_role;

create or replace function public.platform_can_view_audit()
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
          'finance',
          'support',
          'developer'
        )
    );
$function$;

create or replace function public.platform_audit_sanitize_json(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  result jsonb;
  item record;
  secret_keys constant text[] := array[
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'authorization',
    'client_secret',
    'clientsecret',
    'api_key',
    'apikey',
    'password',
    'secret',
    'token',
    'encrypted_credentials',
    'encryptedcredentials',
    'service_role_key',
    'servicerolekey',
    'webhook_secret',
    'webhooksecret',
    'signing_secret',
    'signingsecret'
  ];
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      result := '{}'::jsonb;

      for item in
        select key, value
        from jsonb_each(p_value)
      loop
        if lower(item.key) = any(secret_keys)
           or lower(item.key) like '%password%'
           or lower(item.key) like '%secret%'
           or lower(item.key) like '%token%'
           or lower(item.key) like '%credential%' then
          continue;
        end if;

        result := result || jsonb_build_object(
          item.key,
          public.platform_audit_sanitize_json(item.value)
        );
      end loop;

      return result;

    when 'array' then
      select coalesce(
        jsonb_agg(public.platform_audit_sanitize_json(array_item.value)),
        '[]'::jsonb
      )
      into result
      from jsonb_array_elements(p_value) array_item(value);

      return result;

    else
      return p_value;
  end case;
end;
$function$;

create or replace function public.platform_audit_category(
  p_action text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when p_action like 'organization.%' then 'organization'
    when p_action like 'subscription.%' then 'subscription'
    when p_action like 'billing.%' then 'billing'
    when p_action like 'telephony.%' then 'telephony'
    when p_action like 'ai.%' then 'ai'
    when p_action like 'support.%' then 'support'
    else 'platform'
  end;
$function$;

create or replace function public.platform_audit_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_view_audit() then
    raise exception 'PLATFORM_AUDIT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'eventsLast24Hours',
      count(*) filter (
        where audit.created_at >= pg_catalog.now() - interval '24 hours'
      ),
    'eventsLast7Days',
      count(*) filter (
        where audit.created_at >= pg_catalog.now() - interval '7 days'
      ),
    'activeActorsLast7Days',
      count(distinct audit.actor_user_id) filter (
        where audit.created_at >= pg_catalog.now() - interval '7 days'
          and audit.actor_user_id is not null
      ),
    'organizationsTouchedLast7Days',
      count(distinct audit.organization_id) filter (
        where audit.created_at >= pg_catalog.now() - interval '7 days'
          and audit.organization_id is not null
      ),
    'supportSessionsLast7Days',
      count(*) filter (
        where audit.created_at >= pg_catalog.now() - interval '7 days'
          and audit.action = 'support.session_started'
      ),
    'billingActionsLast7Days',
      count(*) filter (
        where audit.created_at >= pg_catalog.now() - interval '7 days'
          and audit.action like 'billing.%'
      ),
    'providerActionsLast7Days',
      count(*) filter (
        where audit.created_at >= pg_catalog.now() - interval '7 days'
          and (
            audit.action like 'telephony.%'
            or audit.action like 'ai.%'
          )
      )
  )
  into result
  from public.platform_audit_logs audit;

  return result;
end;
$function$;

create or replace function public.platform_audit_event_directory(
  p_search text default null,
  p_category text default null,
  p_actor_role text default null,
  p_resource_type text default null,
  p_days integer default 30,
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
  result jsonb;
  normalized_search text :=
    nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_category text :=
    nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_category, ''))), '');
  normalized_actor_role text :=
    nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_actor_role, ''))), '');
  normalized_resource_type text :=
    nullif(pg_catalog.btrim(coalesce(p_resource_type, '')), '');
  safe_days integer := coalesce(p_days, 30);
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.platform_can_view_audit() then
    raise exception 'PLATFORM_AUDIT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_category is not null
     and normalized_category not in (
       'organization',
       'subscription',
       'billing',
       'telephony',
       'ai',
       'support'
     ) then
    raise exception 'INVALID_PLATFORM_AUDIT_CATEGORY'
      using errcode = '22023';
  end if;

  if normalized_actor_role is not null
     and normalized_actor_role not in (
       'platform_owner',
       'platform_admin',
       'finance',
       'support',
       'developer'
     ) then
    raise exception 'INVALID_PLATFORM_AUDIT_ROLE'
      using errcode = '22023';
  end if;

  if safe_days not in (0, 1, 7, 30, 90) then
    raise exception 'INVALID_PLATFORM_AUDIT_DATE_RANGE'
      using errcode = '22023';
  end if;

  with filtered as (
    select
      audit.id,
      audit.action,
      public.platform_audit_category(audit.action) as category,
      audit.resource_type,
      audit.resource_id,
      audit.organization_id,
      organization.name as organization_name,
      audit.actor_user_id,
      audit.actor_role,
      account.email as actor_email,
      audit.reason,
      audit.created_at
    from public.platform_audit_logs audit
    left join public.organizations organization
      on organization.id = audit.organization_id
    left join auth.users account
      on account.id = audit.actor_user_id
    where (
        safe_days = 0
        or audit.created_at >=
          pg_catalog.now() - pg_catalog.make_interval(days => safe_days)
      )
      and (
        normalized_category is null
        or public.platform_audit_category(audit.action) = normalized_category
      )
      and (
        normalized_actor_role is null
        or audit.actor_role::text = normalized_actor_role
      )
      and (
        normalized_resource_type is null
        or audit.resource_type = normalized_resource_type
      )
      and (
        normalized_search is null
        or audit.action ilike '%' || normalized_search || '%'
        or audit.resource_type ilike '%' || normalized_search || '%'
        or coalesce(audit.resource_id, '') ilike '%' || normalized_search || '%'
        or coalesce(audit.reason, '') ilike '%' || normalized_search || '%'
        or coalesce(organization.name, '') ilike '%' || normalized_search || '%'
        or coalesce(account.email, '') ilike '%' || normalized_search || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by created_at desc, id desc
    limit safe_limit
    offset safe_offset
  )
  select jsonb_build_object(
    'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', row_item.id,
              'action', row_item.action,
              'category', row_item.category,
              'resourceType', row_item.resource_type,
              'resourceId', row_item.resource_id,
              'organizationId', row_item.organization_id,
              'organizationName', row_item.organization_name,
              'actorUserId', row_item.actor_user_id,
              'actorRole', row_item.actor_role::text,
              'actorEmail', row_item.actor_email,
              'reason', row_item.reason,
              'createdAt', row_item.created_at
            )
            order by row_item.created_at desc, row_item.id desc
          )
          from page_rows row_item
        ),
        '[]'::jsonb
      ),
    'total', (select count(*) from filtered),
    'limit', safe_limit,
    'offset', safe_offset
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_audit_event_detail(
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  audit_row public.platform_audit_logs%rowtype;
  organization_name text;
  actor_email text;
  result jsonb;
begin
  if not public.platform_can_view_audit() then
    raise exception 'PLATFORM_AUDIT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select audit.*
  into audit_row
  from public.platform_audit_logs audit
  where audit.id = p_event_id;

  if audit_row.id is null then
    return null;
  end if;

  select organization.name
  into organization_name
  from public.organizations organization
  where organization.id = audit_row.organization_id;

  select account.email
  into actor_email
  from auth.users account
  where account.id = audit_row.actor_user_id;

  select jsonb_build_object(
    'id', audit_row.id,
    'action', audit_row.action,
    'category', public.platform_audit_category(audit_row.action),
    'resourceType', audit_row.resource_type,
    'resourceId', audit_row.resource_id,
    'organizationId', audit_row.organization_id,
    'organizationName', organization_name,
    'actorUserId', audit_row.actor_user_id,
    'actorRole', audit_row.actor_role::text,
    'actorEmail', actor_email,
    'reason', audit_row.reason,
    'previousState',
      public.platform_audit_sanitize_json(audit_row.previous_state),
    'resultingState',
      public.platform_audit_sanitize_json(audit_row.resulting_state),
    'metadata',
      coalesce(
        public.platform_audit_sanitize_json(audit_row.metadata),
        '{}'::jsonb
      ),
    'createdAt', audit_row.created_at
  )
  into result;

  return result;
end;
$function$;

revoke all on function public.platform_can_view_audit()
from public, anon;

revoke all on function public.platform_audit_sanitize_json(jsonb)
from public, anon, authenticated;

revoke all on function public.platform_audit_category(text)
from public, anon;

revoke all on function public.platform_audit_metrics()
from public, anon;

revoke all on function public.platform_audit_event_directory(
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
)
from public, anon;

revoke all on function public.platform_audit_event_detail(uuid)
from public, anon;

grant execute on function public.platform_can_view_audit()
to authenticated;

grant execute on function public.platform_audit_category(text)
to authenticated;

grant execute on function public.platform_audit_metrics()
to authenticated;

grant execute on function public.platform_audit_event_directory(
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
)
to authenticated;

grant execute on function public.platform_audit_event_detail(uuid)
to authenticated;

grant execute on function public.platform_audit_sanitize_json(jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
