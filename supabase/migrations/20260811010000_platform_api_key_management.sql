-- Flowtix Platform Developer — API Key Management
-- Moves organization API-key management out of the customer workspace.
-- Existing key hashes/scopes/usage limits are preserved. Customer RLS access is removed.

begin;

-- Customer workspace users no longer manage API credentials directly.
drop policy if exists "members view api keys" on public.api_keys;
drop policy if exists "admins manage api keys" on public.api_keys;
revoke all on table public.api_keys from public, anon, authenticated;
grant all on table public.api_keys to service_role;

create or replace function public.platform_api_key_directory(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  organization_row public.organizations%rowtype;
  key_rows jsonb := '[]'::jsonb;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin', 'developer')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_API_KEY_ACCESS_DENIED' using errcode = '42501';
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = p_organization_id;

  if organization_row.id is null then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', api_key.id,
        'name', api_key.name,
        'keyPrefix', api_key.key_prefix,
        'scopes', to_jsonb(api_key.scopes),
        'lastUsedAt', api_key.last_used_at,
        'revokedAt', api_key.revoked_at,
        'createdAt', api_key.created_at
      )
      order by api_key.created_at desc
    ),
    '[]'::jsonb
  )
  into key_rows
  from public.api_keys api_key
  where api_key.organization_id = p_organization_id;

  return jsonb_build_object(
    'organizationId', organization_row.id,
    'organizationName', organization_row.name,
    'timezone', coalesce(nullif(organization_row.timezone, ''), 'UTC'),
    'keys', key_rows
  );
end;
$function$;

create or replace function public.platform_create_api_key(
  p_organization_id uuid,
  p_name text,
  p_key_prefix text,
  p_key_hash text,
  p_scopes text[],
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  organization_row public.organizations%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  plan_row public.subscription_plans%rowtype;
  normalized_name text := nullif(pg_catalog.btrim(coalesce(p_name, '')), '');
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  normalized_scopes text[] := coalesce(p_scopes, '{}'::text[]);
  allowed_scopes constant text[] := array[
    'contacts:read',
    'contacts:write',
    'calls:read',
    'calls:write',
    'reports:read'
  ];
  active_key_count bigint := 0;
  entitlement_allowed boolean := false;
  new_key public.api_keys%rowtype;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin', 'developer')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_API_KEY_MANAGE_DENIED' using errcode = '42501';
  end if;

  if normalized_reason is null or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'PLATFORM_ACTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  if normalized_name is null then
    raise exception 'API key name is required.' using errcode = '22023';
  end if;

  if p_key_prefix is null or pg_catalog.char_length(pg_catalog.btrim(p_key_prefix)) < 8 then
    raise exception 'API key prefix is invalid.' using errcode = '22023';
  end if;

  if p_key_hash is null or pg_catalog.char_length(pg_catalog.btrim(p_key_hash)) <> 64 then
    raise exception 'API key hash is invalid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(normalized_scopes) scope_value
    where not (scope_value = any(allowed_scopes))
  ) then
    raise exception 'One or more API key scopes are invalid.' using errcode = '22023';
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = p_organization_id
  for update;

  if organization_row.id is null then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  if coalesce(organization_row.status, 'active') <> 'active' then
    raise exception 'API keys cannot be created for an inactive organization.' using errcode = '42501';
  end if;

  select subscription.*
  into subscription_row
  from public.organization_subscriptions subscription
  where subscription.organization_id = p_organization_id
  limit 1;

  if subscription_row.id is not null then
    select plan.*
    into plan_row
    from public.subscription_plans plan
    where plan.id = subscription_row.plan_id
      and plan.is_active = true
    limit 1;

    entitlement_allowed :=
      plan_row.id is not null
      and coalesce(plan_row.entitlements, '[]'::jsonb) ? 'api.access'
      and (
        subscription_row.status = 'active'
        or (
          subscription_row.status = 'trialing'
          and subscription_row.trial_ends_at is not null
          and subscription_row.trial_ends_at > pg_catalog.now()
        )
        or (
          subscription_row.status = 'past_due'
          and subscription_row.grace_period_ends_at is not null
          and subscription_row.grace_period_ends_at > pg_catalog.now()
        )
      );
  end if;

  if not entitlement_allowed then
    raise exception 'FEATURE_NOT_INCLUDED: api.access is not enabled for this organization.' using errcode = '42501';
  end if;

  select count(*)
  into active_key_count
  from public.api_keys api_key
  where api_key.organization_id = p_organization_id
    and api_key.revoked_at is null;

  if plan_row.max_api_keys is not null
     and active_key_count + 1 > plan_row.max_api_keys then
    raise exception 'USAGE_LIMIT_REACHED: API key limit reached for this organization.' using errcode = 'P0001';
  end if;

  insert into public.api_keys (
    organization_id,
    name,
    key_prefix,
    key_hash,
    scopes,
    created_by
  )
  values (
    p_organization_id,
    normalized_name,
    pg_catalog.btrim(p_key_prefix),
    pg_catalog.btrim(p_key_hash),
    normalized_scopes,
    actor.user_id
  )
  returning * into new_key;

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
    'api_key.created',
    'api_key',
    new_key.id::text,
    p_organization_id,
    normalized_reason,
    null,
    jsonb_build_object(
      'name', new_key.name,
      'keyPrefix', new_key.key_prefix,
      'scopes', to_jsonb(new_key.scopes),
      'status', 'active'
    ),
    jsonb_build_object(
      'managedFrom', 'platform_developer',
      'secretStoredAsHash', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', new_key.id,
    'keyPrefix', new_key.key_prefix
  );
end;
$function$;

create or replace function public.platform_revoke_api_key(
  p_organization_id uuid,
  p_key_id uuid,
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
  key_row public.api_keys%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin', 'developer')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_API_KEY_MANAGE_DENIED' using errcode = '42501';
  end if;

  if normalized_reason is null or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'PLATFORM_ACTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select api_key.*
  into key_row
  from public.api_keys api_key
  where api_key.id = p_key_id
    and api_key.organization_id = p_organization_id
  for update;

  if key_row.id is null then
    raise exception 'API key not found.' using errcode = 'P0002';
  end if;

  if key_row.revoked_at is not null then
    return true;
  end if;

  update public.api_keys
  set revoked_at = pg_catalog.now()
  where id = key_row.id;

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
    'api_key.revoked',
    'api_key',
    key_row.id::text,
    p_organization_id,
    normalized_reason,
    jsonb_build_object(
      'name', key_row.name,
      'keyPrefix', key_row.key_prefix,
      'scopes', to_jsonb(key_row.scopes),
      'status', 'active'
    ),
    jsonb_build_object(
      'name', key_row.name,
      'keyPrefix', key_row.key_prefix,
      'scopes', to_jsonb(key_row.scopes),
      'status', 'revoked'
    ),
    jsonb_build_object('managedFrom', 'platform_developer')
  );

  return true;
end;
$function$;

revoke all on function public.platform_api_key_directory(uuid) from public, anon;
revoke all on function public.platform_create_api_key(uuid, text, text, text, text[], text) from public, anon;
revoke all on function public.platform_revoke_api_key(uuid, uuid, text) from public, anon;

grant execute on function public.platform_api_key_directory(uuid) to authenticated, service_role;
grant execute on function public.platform_create_api_key(uuid, text, text, text, text[], text) to authenticated, service_role;
grant execute on function public.platform_revoke_api_key(uuid, uuid, text) to authenticated, service_role;

commit;
