-- Flowtix Platform Admin — Platform Settings
--
-- Owner-only, non-secret platform configuration.
-- Provider/API credentials remain in server environment variables.
-- This migration also makes the existing support-session duration/reference
-- policy read from safe Platform Settings without changing the read-only
-- support-impersonation security model.

begin;

create table if not exists public.platform_settings (
  setting_key text primary key,
  category text not null,
  display_name text not null,
  description text,
  value jsonb not null,
  value_type text not null
    check (value_type in ('string','integer','boolean','url','email')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.platform_settings enable row level security;

revoke all on table public.platform_settings
from public, anon, authenticated;

grant all on table public.platform_settings
to service_role;

insert into public.platform_settings (
  setting_key,
  category,
  display_name,
  description,
  value,
  value_type
)
values
  (
    'general.platform_name',
    'general',
    'Platform name',
    'Internal/public product name used by platform-managed metadata.',
    to_jsonb('Flowtix'::text),
    'string'
  ),
  (
    'general.support_email',
    'general',
    'Support email',
    'Non-secret support contact email.',
    to_jsonb(''::text),
    'email'
  ),
  (
    'general.status_page_url',
    'general',
    'Status page URL',
    'Optional public status page URL.',
    to_jsonb(''::text),
    'url'
  ),
  (
    'support.session_minutes',
    'support',
    'Support session duration',
    'Maximum duration of a temporary read-only support workspace session.',
    to_jsonb(30),
    'integer'
  ),
  (
    'support.reference_required',
    'support',
    'Support reference required',
    'Require a support ticket/reference before temporary workspace access.',
    to_jsonb(false),
    'boolean'
  ),
  (
    'operations.default_timezone',
    'operations',
    'Default timezone',
    'Safe default for future platform-managed workflows. Existing organizations are not rewritten.',
    to_jsonb('UTC'::text),
    'string'
  ),
  (
    'operations.default_locale',
    'operations',
    'Default locale',
    'Safe default locale for future platform-managed workflows.',
    to_jsonb('en'::text),
    'string'
  )
on conflict (setting_key) do nothing;

create or replace function public.platform_can_manage_settings()
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
        and platform_user.role = 'platform_owner'
    );
$function$;

create or replace function public.platform_settings_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_manage_settings() then
    raise exception 'PLATFORM_SETTINGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'platformName',
      coalesce(
        (select setting.value #>> '{}'
         from public.platform_settings setting
         where setting.setting_key = 'general.platform_name'),
        'Flowtix'
      ),
    'supportEmail',
      coalesce(
        (select setting.value #>> '{}'
         from public.platform_settings setting
         where setting.setting_key = 'general.support_email'),
        ''
      ),
    'statusPageUrl',
      coalesce(
        (select setting.value #>> '{}'
         from public.platform_settings setting
         where setting.setting_key = 'general.status_page_url'),
        ''
      ),
    'supportSessionMinutes',
      coalesce(
        (select (setting.value #>> '{}')::integer
         from public.platform_settings setting
         where setting.setting_key = 'support.session_minutes'),
        30
      ),
    'supportReferenceRequired',
      coalesce(
        (select (setting.value #>> '{}')::boolean
         from public.platform_settings setting
         where setting.setting_key = 'support.reference_required'),
        false
      ),
    'defaultTimezone',
      coalesce(
        (select setting.value #>> '{}'
         from public.platform_settings setting
         where setting.setting_key = 'operations.default_timezone'),
        'UTC'
      ),
    'defaultLocale',
      coalesce(
        (select setting.value #>> '{}'
         from public.platform_settings setting
         where setting.setting_key = 'operations.default_locale'),
        'en'
      ),
    'updatedAt',
      (select max(setting.updated_at) from public.platform_settings setting)
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_support_policy()
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
      and platform_user.role in ('platform_owner','platform_admin','support')
  ) then
    raise exception 'PLATFORM_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'sessionMinutes',
      least(
        greatest(
          coalesce(
            (select (setting.value #>> '{}')::integer
             from public.platform_settings setting
             where setting.setting_key = 'support.session_minutes'),
            30
          ),
          5
        ),
        120
      ),
    'referenceRequired',
      coalesce(
        (select (setting.value #>> '{}')::boolean
         from public.platform_settings setting
         where setting.setting_key = 'support.reference_required'),
        false
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_update_settings(
  p_updates jsonb,
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
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  platform_name text;
  support_email text;
  status_page_url text;
  support_session_minutes integer;
  support_reference_required boolean;
  default_timezone text;
  default_locale text;
  previous_snapshot jsonb;
  resulting_snapshot jsonb;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role = 'platform_owner'
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_SETTINGS_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'PLATFORM_SETTINGS_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'object' then
    raise exception 'INVALID_PLATFORM_SETTINGS_PAYLOAD'
      using errcode = '22023';
  end if;

  platform_name := pg_catalog.btrim(coalesce(p_updates ->> 'platform_name', ''));
  support_email := pg_catalog.btrim(coalesce(p_updates ->> 'support_email', ''));
  status_page_url := pg_catalog.btrim(coalesce(p_updates ->> 'status_page_url', ''));
  support_session_minutes := (p_updates ->> 'support_session_minutes')::integer;
  support_reference_required := (p_updates ->> 'support_reference_required')::boolean;
  default_timezone := pg_catalog.btrim(coalesce(p_updates ->> 'default_timezone', ''));
  default_locale := pg_catalog.btrim(coalesce(p_updates ->> 'default_locale', ''));

  if pg_catalog.char_length(platform_name) < 2
     or pg_catalog.char_length(platform_name) > 80 then
    raise exception 'INVALID_PLATFORM_NAME'
      using errcode = '22023';
  end if;

  if support_email <> ''
     and support_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' then
    raise exception 'INVALID_SUPPORT_EMAIL'
      using errcode = '22023';
  end if;

  if status_page_url <> ''
     and status_page_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'INVALID_STATUS_PAGE_URL'
      using errcode = '22023';
  end if;

  if support_session_minutes < 5 or support_session_minutes > 120 then
    raise exception 'INVALID_SUPPORT_SESSION_DURATION'
      using errcode = '22023';
  end if;

  if default_timezone = '' or pg_catalog.char_length(default_timezone) > 100 then
    raise exception 'INVALID_DEFAULT_TIMEZONE'
      using errcode = '22023';
  end if;

  if default_locale !~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})?$' then
    raise exception 'INVALID_DEFAULT_LOCALE'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'platformName',
      coalesce((select value #>> '{}' from public.platform_settings where setting_key = 'general.platform_name'), 'Flowtix'),
    'supportEmail',
      coalesce((select value #>> '{}' from public.platform_settings where setting_key = 'general.support_email'), ''),
    'statusPageUrl',
      coalesce((select value #>> '{}' from public.platform_settings where setting_key = 'general.status_page_url'), ''),
    'supportSessionMinutes',
      coalesce((select (value #>> '{}')::integer from public.platform_settings where setting_key = 'support.session_minutes'), 30),
    'supportReferenceRequired',
      coalesce((select (value #>> '{}')::boolean from public.platform_settings where setting_key = 'support.reference_required'), false),
    'defaultTimezone',
      coalesce((select value #>> '{}' from public.platform_settings where setting_key = 'operations.default_timezone'), 'UTC'),
    'defaultLocale',
      coalesce((select value #>> '{}' from public.platform_settings where setting_key = 'operations.default_locale'), 'en')
  ) into previous_snapshot;

  update public.platform_settings
  set value = to_jsonb(platform_name), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'general.platform_name';

  update public.platform_settings
  set value = to_jsonb(support_email), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'general.support_email';

  update public.platform_settings
  set value = to_jsonb(status_page_url), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'general.status_page_url';

  update public.platform_settings
  set value = to_jsonb(support_session_minutes), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'support.session_minutes';

  update public.platform_settings
  set value = to_jsonb(support_reference_required), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'support.reference_required';

  update public.platform_settings
  set value = to_jsonb(default_timezone), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'operations.default_timezone';

  update public.platform_settings
  set value = to_jsonb(default_locale), updated_by = actor.user_id, updated_at = pg_catalog.now()
  where setting_key = 'operations.default_locale';

  resulting_snapshot := jsonb_build_object(
    'platformName', platform_name,
    'supportEmail', support_email,
    'statusPageUrl', status_page_url,
    'supportSessionMinutes', support_session_minutes,
    'supportReferenceRequired', support_reference_required,
    'defaultTimezone', default_timezone,
    'defaultLocale', default_locale
  );

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
    'settings.platform_updated',
    'platform_settings',
    'global',
    normalized_reason,
    previous_snapshot,
    resulting_snapshot,
    jsonb_build_object(
      'secretValuesAccepted', false,
      'environmentCredentialsUnchanged', true
    )
  );

  return true;
end;
$function$;

-- Replace the existing support-session start function so duration/reference
-- policy comes from platform_settings while preserving all original guards.
create or replace function public.platform_start_support_session(
  p_organization_id uuid,
  p_reason text,
  p_reference text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  organization_row public.organizations%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  normalized_reference text :=
    nullif(pg_catalog.btrim(coalesce(p_reference, '')), '');
  created_session_id uuid;
  session_minutes integer := 30;
  reference_required boolean := false;
  session_expires_at timestamptz;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'support'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 15 then
    raise exception 'SUPPORT_ACCESS_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select
    least(
      greatest(
        coalesce(
          (select (setting.value #>> '{}')::integer
           from public.platform_settings setting
           where setting.setting_key = 'support.session_minutes'),
          30
        ),
        5
      ),
      120
    ),
    coalesce(
      (select (setting.value #>> '{}')::boolean
       from public.platform_settings setting
       where setting.setting_key = 'support.reference_required'),
      false
    )
  into session_minutes, reference_required;

  if reference_required and normalized_reference is null then
    raise exception 'SUPPORT_REFERENCE_REQUIRED'
      using errcode = '22023';
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = p_organization_id;

  if organization_row.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if coalesce(organization_row.status, 'active') = 'archived' then
    raise exception 'ARCHIVED_ORGANIZATION_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  update public.platform_support_sessions session_row
  set
    status = 'ended',
    ended_at = pg_catalog.now(),
    outcome = coalesce(
      session_row.outcome,
      'Automatically ended when a new support session was started.'
    ),
    updated_at = pg_catalog.now()
  where session_row.actor_user_id = actor.user_id
    and session_row.status = 'active';

  session_expires_at :=
    pg_catalog.now() + pg_catalog.make_interval(mins => session_minutes);

  insert into public.platform_support_sessions (
    organization_id,
    platform_user_id,
    actor_user_id,
    actor_role,
    reason,
    reference,
    status,
    started_at,
    expires_at
  )
  values (
    organization_row.id,
    actor.id,
    actor.user_id,
    actor.role,
    normalized_reason,
    normalized_reference,
    'active',
    pg_catalog.now(),
    session_expires_at
  )
  returning id into created_session_id;

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
    'support.session_started',
    'support_session',
    created_session_id::text,
    organization_row.id,
    normalized_reason,
    null,
    jsonb_build_object(
      'status', 'active',
      'expiresAt', session_expires_at
    ),
    jsonb_build_object(
      'reference', normalized_reference,
      'mode', 'read_only',
      'sessionMinutes', session_minutes,
      'referenceRequired', reference_required,
      'staffMembershipCreated', false,
      'customerRlsWeakened', false
    )
  );

  return created_session_id;
end;
$function$;

revoke all on function public.platform_can_manage_settings()
from public, anon;

revoke all on function public.platform_settings_snapshot()
from public, anon;

revoke all on function public.platform_support_policy()
from public, anon;

revoke all on function public.platform_update_settings(jsonb,text)
from public, anon;

revoke all on function public.platform_start_support_session(uuid,text,text)
from public, anon;

grant execute on function public.platform_can_manage_settings()
to authenticated;

grant execute on function public.platform_settings_snapshot()
to authenticated;

grant execute on function public.platform_support_policy()
to authenticated;

grant execute on function public.platform_update_settings(jsonb,text)
to authenticated;

grant execute on function public.platform_start_support_session(uuid,text,text)
to authenticated;

notify pgrst, 'reload schema';

commit;
