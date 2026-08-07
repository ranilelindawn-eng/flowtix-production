-- Flowtix Platform Admin — Telephony Provider Management
--
-- Cross-tenant operational visibility for customer-owned Twilio, Telnyx,
-- SignalWire, and Plivo connections.
--
-- Security:
-- - credentials remain only in organization_integration_secrets;
-- - platform RPCs never return encrypted credentials;
-- - provider enable/disable changes require platform owner/admin/developer;
-- - all platform mutations are written to platform_audit_logs;
-- - customer phone-number and routing ownership remains unchanged.

begin;

create table if not exists public.platform_telephony_health_checks (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null
    references public.organization_integrations(id) on delete cascade,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  provider text not null
    check (provider in ('twilio','telnyx','signalwire','plivo')),
  status text not null
    check (status in ('success','failed')),
  message text not null,
  platform_user_id uuid
    references public.platform_users(id) on delete set null,
  actor_user_id uuid
    references auth.users(id) on delete set null,
  actor_role public.platform_role,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists platform_telephony_health_checks_integration_idx
  on public.platform_telephony_health_checks(integration_id, created_at desc);

create index if not exists platform_telephony_health_checks_org_idx
  on public.platform_telephony_health_checks(organization_id, created_at desc);

alter table public.platform_telephony_health_checks enable row level security;

revoke all on table public.platform_telephony_health_checks
from public, anon, authenticated;

grant all on table public.platform_telephony_health_checks
to service_role;

create or replace function public.platform_can_manage_telephony()
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

create or replace function public.platform_telephony_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_manage_telephony() then
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'connectedIntegrations',
      (
        select count(*)
        from public.organization_integrations integration
        where integration.provider in ('twilio','telnyx','signalwire','plivo')
          and integration.enabled = true
          and integration.status = 'connected'
      ),
    'enabledIntegrations',
      (
        select count(*)
        from public.organization_integrations integration
        where integration.provider in ('twilio','telnyx','signalwire','plivo')
          and integration.enabled = true
      ),
    'organizationsWithTelephony',
      (
        select count(distinct integration.organization_id)
        from public.organization_integrations integration
        where integration.provider in ('twilio','telnyx','signalwire','plivo')
      ),
    'phoneNumbers',
      (
        select count(*)
        from public.organization_phone_numbers phone
        where phone.provider in ('twilio','telnyx','signalwire','plivo')
      ),
    'providerErrorsLast24Hours',
      (
        select count(*)
        from public.telephony_provider_events provider_event
        where provider_event.occurred_at >= pg_catalog.now() - interval '24 hours'
          and (
            provider_event.normalized_status = 'failed'
            or provider_event.event_type ilike '%fail%'
            or provider_event.event_type ilike '%error%'
            or provider_event.raw_status ilike '%fail%'
            or provider_event.raw_status ilike '%error%'
          )
      ),
    'callsLast24Hours',
      (
        select count(*)
        from public.calls call_row
        where call_row.started_at >= pg_catalog.now() - interval '24 hours'
          and call_row.provider in ('twilio','telnyx','signalwire','plivo')
      ),
    'failedCallsLast24Hours',
      (
        select count(*)
        from public.calls call_row
        where call_row.started_at >= pg_catalog.now() - interval '24 hours'
          and call_row.provider in ('twilio','telnyx','signalwire','plivo')
          and call_row.status in ('failed','cancelled')
      ),
    'verificationFailuresLast24Hours',
      (
        select count(*)
        from public.platform_telephony_health_checks health
        where health.created_at >= pg_catalog.now() - interval '24 hours'
          and health.status = 'failed'
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_telephony_connection_directory(
  p_search text default null,
  p_provider text default null,
  p_status text default null,
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
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_provider text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider, ''))), '');
  normalized_status text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, ''))), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.platform_can_manage_telephony() then
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_provider is not null
     and normalized_provider not in ('twilio','telnyx','signalwire','plivo') then
    raise exception 'INVALID_TELEPHONY_PROVIDER'
      using errcode = '22023';
  end if;

  if normalized_status is not null
     and normalized_status not in (
       'connected','configured','disconnected','error','disabled'
     ) then
    raise exception 'INVALID_TELEPHONY_STATUS'
      using errcode = '22023';
  end if;

  with filtered as (
    select
      integration.id,
      integration.organization_id,
      organization.name as organization_name,
      coalesce(organization.status, 'active') as organization_status,
      integration.provider,
      integration.enabled,
      integration.status,
      integration.connected_at,
      integration.connected_by,
      integration.last_error,
      integration.updated_at,
      (
        select count(*)
        from public.organization_phone_numbers phone
        where phone.organization_id = integration.organization_id
          and phone.provider = integration.provider
      ) as phone_number_count,
      (
        select phone.phone_number
        from public.organization_phone_numbers phone
        where phone.organization_id = integration.organization_id
          and phone.provider = integration.provider
          and phone.is_default = true
        order by phone.created_at asc
        limit 1
      ) as default_phone_number,
      (
        select count(*)
        from public.calls call_row
        where call_row.organization_id = integration.organization_id
          and call_row.provider = integration.provider
          and call_row.started_at >= pg_catalog.now() - interval '24 hours'
      ) as calls_last_24_hours,
      (
        select count(*)
        from public.telephony_provider_events provider_event
        where provider_event.organization_id = integration.organization_id
          and provider_event.provider = integration.provider
          and provider_event.occurred_at >= pg_catalog.now() - interval '24 hours'
          and (
            provider_event.normalized_status = 'failed'
            or provider_event.raw_status ilike '%fail%'
            or provider_event.raw_status ilike '%error%'
          )
      ) as provider_errors_last_24_hours,
      (
        select max(provider_event.occurred_at)
        from public.telephony_provider_events provider_event
        where provider_event.organization_id = integration.organization_id
          and provider_event.provider = integration.provider
      ) as last_provider_event_at,
      (
        select health.status
        from public.platform_telephony_health_checks health
        where health.integration_id = integration.id
        order by health.created_at desc
        limit 1
      ) as last_verification_status,
      (
        select health.created_at
        from public.platform_telephony_health_checks health
        where health.integration_id = integration.id
        order by health.created_at desc
        limit 1
      ) as last_verification_at
    from public.organization_integrations integration
    join public.organizations organization
      on organization.id = integration.organization_id
    where integration.provider in ('twilio','telnyx','signalwire','plivo')
      and (
        normalized_provider is null
        or integration.provider = normalized_provider
      )
      and (
        normalized_status is null
        or (
          normalized_status = 'disabled'
          and integration.enabled = false
        )
        or (
          normalized_status <> 'disabled'
          and integration.enabled = true
          and integration.status = normalized_status
        )
      )
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or exists (
          select 1
          from public.organization_phone_numbers search_phone
          where search_phone.organization_id = integration.organization_id
            and search_phone.provider = integration.provider
            and search_phone.phone_number ilike '%' || normalized_search || '%'
        )
      )
  ),
  page_rows as (
    select *
    from filtered
    order by
      case when enabled = false then 0 else 1 end,
      organization_name asc,
      provider asc
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
              'organizationId', row_item.organization_id,
              'organizationName', row_item.organization_name,
              'organizationStatus', row_item.organization_status,
              'provider', row_item.provider,
              'enabled', row_item.enabled,
              'status', row_item.status,
              'connectedAt', row_item.connected_at,
              'connectedBy', row_item.connected_by,
              'lastError', row_item.last_error,
              'updatedAt', row_item.updated_at,
              'phoneNumberCount', row_item.phone_number_count,
              'defaultPhoneNumber', row_item.default_phone_number,
              'callsLast24Hours', row_item.calls_last_24_hours,
              'providerErrorsLast24Hours', row_item.provider_errors_last_24_hours,
              'lastProviderEventAt', row_item.last_provider_event_at,
              'lastVerificationStatus', row_item.last_verification_status,
              'lastVerificationAt', row_item.last_verification_at
            )
            order by
              case when row_item.enabled = false then 0 else 1 end,
              row_item.organization_name asc,
              row_item.provider asc
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

create or replace function public.platform_telephony_connection_detail(
  p_integration_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  integration_row public.organization_integrations%rowtype;
  organization_name text;
  organization_status text;
  result jsonb;
begin
  if not public.platform_can_manage_telephony() then
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select integration.*
  into integration_row
  from public.organization_integrations integration
  where integration.id = p_integration_id
    and integration.provider in ('twilio','telnyx','signalwire','plivo');

  if integration_row.id is null then
    return null;
  end if;

  select
    organization.name,
    coalesce(organization.status, 'active')
  into
    organization_name,
    organization_status
  from public.organizations organization
  where organization.id = integration_row.organization_id;

  select jsonb_build_object(
    'id', integration_row.id,
    'organizationId', integration_row.organization_id,
    'organizationName', organization_name,
    'organizationStatus', organization_status,
    'provider', integration_row.provider,
    'enabled', integration_row.enabled,
    'status', integration_row.status,
    'connectedAt', integration_row.connected_at,
    'connectedBy', integration_row.connected_by,
    'lastError', integration_row.last_error,
    'updatedAt', integration_row.updated_at,
    'phoneNumberCount',
      (
        select count(*)
        from public.organization_phone_numbers phone
        where phone.organization_id = integration_row.organization_id
          and phone.provider = integration_row.provider
      ),
    'defaultPhoneNumber',
      (
        select phone.phone_number
        from public.organization_phone_numbers phone
        where phone.organization_id = integration_row.organization_id
          and phone.provider = integration_row.provider
          and phone.is_default = true
        order by phone.created_at asc
        limit 1
      ),
    'callsLast24Hours',
      (
        select count(*)
        from public.calls call_row
        where call_row.organization_id = integration_row.organization_id
          and call_row.provider = integration_row.provider
          and call_row.started_at >= pg_catalog.now() - interval '24 hours'
      ),
    'providerErrorsLast24Hours',
      (
        select count(*)
        from public.telephony_provider_events provider_event
        where provider_event.organization_id = integration_row.organization_id
          and provider_event.provider = integration_row.provider
          and provider_event.occurred_at >= pg_catalog.now() - interval '24 hours'
          and (
            provider_event.normalized_status = 'failed'
            or provider_event.raw_status ilike '%fail%'
            or provider_event.raw_status ilike '%error%'
          )
      ),
    'lastProviderEventAt',
      (
        select max(provider_event.occurred_at)
        from public.telephony_provider_events provider_event
        where provider_event.organization_id = integration_row.organization_id
          and provider_event.provider = integration_row.provider
      ),
    'lastVerificationStatus',
      (
        select health.status
        from public.platform_telephony_health_checks health
        where health.integration_id = integration_row.id
        order by health.created_at desc
        limit 1
      ),
    'lastVerificationAt',
      (
        select health.created_at
        from public.platform_telephony_health_checks health
        where health.integration_id = integration_row.id
        order by health.created_at desc
        limit 1
      ),
    'configSummary',
      jsonb_strip_nulls(
        jsonb_build_object(
          'connection_id', integration_row.config ->> 'connection_id',
          'space_url', integration_row.config ->> 'space_url',
          'phone_number', integration_row.config ->> 'phone_number'
        )
      ),
    'numbers',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', phone.id,
              'phoneNumber', phone.phone_number,
              'friendlyName', phone.friendly_name,
              'isDefault', phone.is_default,
              'recordingEnabled', phone.recording_enabled,
              'inboundRoute', phone.inbound_route,
              'capabilities', phone.capabilities,
              'createdAt', phone.created_at
            )
            order by phone.is_default desc, phone.created_at asc
          )
          from public.organization_phone_numbers phone
          where phone.organization_id = integration_row.organization_id
            and phone.provider = integration_row.provider
        ),
        '[]'::jsonb
      ),
    'recentEvents',
      coalesce(
        (
          select jsonb_agg(event_json)
          from (
            select jsonb_build_object(
              'id', provider_event.id,
              'providerEventId', provider_event.provider_event_id,
              'eventType', provider_event.event_type,
              'providerCallId', provider_event.provider_call_id,
              'normalizedStatus', provider_event.normalized_status,
              'rawStatus', provider_event.raw_status,
              'occurredAt', provider_event.occurred_at
            ) as event_json
            from public.telephony_provider_events provider_event
            where provider_event.organization_id = integration_row.organization_id
              and provider_event.provider = integration_row.provider
            order by provider_event.occurred_at desc
            limit 25
          ) recent_provider_events
        ),
        '[]'::jsonb
      ),
    'healthChecks',
      coalesce(
        (
          select jsonb_agg(health_json)
          from (
            select jsonb_build_object(
              'id', health.id,
              'status', health.status,
              'message', health.message,
              'actorUserId', health.actor_user_id,
              'actorRole', health.actor_role::text,
              'createdAt', health.created_at
            ) as health_json
            from public.platform_telephony_health_checks health
            where health.integration_id = integration_row.id
            order by health.created_at desc
            limit 25
          ) recent_health_checks
        ),
        '[]'::jsonb
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_record_telephony_verification(
  p_integration_id uuid,
  p_success boolean,
  p_message text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  integration_row public.organization_integrations%rowtype;
  normalized_message text :=
    nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
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
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select integration.*
  into integration_row
  from public.organization_integrations integration
  where integration.id = p_integration_id
    and integration.provider in ('twilio','telnyx','signalwire','plivo');

  if integration_row.id is null then
    raise exception 'TELEPHONY_INTEGRATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if normalized_message is null then
    normalized_message := case
      when p_success then 'Provider verification succeeded.'
      else 'Provider verification failed.'
    end;
  end if;

  insert into public.platform_telephony_health_checks (
    integration_id,
    organization_id,
    provider,
    status,
    message,
    platform_user_id,
    actor_user_id,
    actor_role
  )
  values (
    integration_row.id,
    integration_row.organization_id,
    integration_row.provider,
    case when p_success then 'success' else 'failed' end,
    normalized_message,
    actor.id,
    actor.user_id,
    actor.role
  );

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
      when p_success
        then 'telephony.provider_verification_succeeded'
      else 'telephony.provider_verification_failed'
    end,
    'telephony_integration',
    integration_row.id::text,
    integration_row.organization_id,
    normalized_message,
    jsonb_build_object(
      'enabled', integration_row.enabled,
      'status', integration_row.status
    ),
    jsonb_build_object(
      'verificationStatus',
      case when p_success then 'success' else 'failed' end
    ),
    jsonb_build_object('provider', integration_row.provider)
  );

  return true;
end;
$function$;

create or replace function public.platform_set_telephony_connection_enabled(
  p_integration_id uuid,
  p_enabled boolean,
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
  integration_row public.organization_integrations%rowtype;
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
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'TELEPHONY_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select integration.*
  into integration_row
  from public.organization_integrations integration
  where integration.id = p_integration_id
    and integration.provider in ('twilio','telnyx','signalwire','plivo')
  for update;

  if integration_row.id is null then
    raise exception 'TELEPHONY_INTEGRATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if integration_row.enabled = p_enabled then
    return true;
  end if;

  update public.organization_integrations
  set
    enabled = p_enabled,
    updated_at = pg_catalog.now()
  where id = integration_row.id;

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
      when p_enabled
        then 'telephony.provider_enabled'
      else 'telephony.provider_disabled'
    end,
    'telephony_integration',
    integration_row.id::text,
    integration_row.organization_id,
    normalized_reason,
    jsonb_build_object(
      'enabled', integration_row.enabled,
      'status', integration_row.status
    ),
    jsonb_build_object(
      'enabled', p_enabled,
      'status', integration_row.status
    ),
    jsonb_build_object(
      'provider', integration_row.provider,
      'credentialsPreserved', true,
      'phoneNumbersPreserved', true,
      'routingPreserved', true
    )
  );

  return true;
end;
$function$;

revoke all on function public.platform_can_manage_telephony()
from public, anon;

revoke all on function public.platform_telephony_metrics()
from public, anon;

revoke all on function public.platform_telephony_connection_directory(
  text,
  text,
  text,
  integer,
  integer
)
from public, anon;

revoke all on function public.platform_telephony_connection_detail(uuid)
from public, anon;

revoke all on function public.platform_record_telephony_verification(
  uuid,
  boolean,
  text
)
from public, anon;

revoke all on function public.platform_set_telephony_connection_enabled(
  uuid,
  boolean,
  text
)
from public, anon;

grant execute on function public.platform_can_manage_telephony()
to authenticated;

grant execute on function public.platform_telephony_metrics()
to authenticated;

grant execute on function public.platform_telephony_connection_directory(
  text,
  text,
  text,
  integer,
  integer
)
to authenticated;

grant execute on function public.platform_telephony_connection_detail(uuid)
to authenticated;

grant execute on function public.platform_record_telephony_verification(
  uuid,
  boolean,
  text
)
to authenticated;

grant execute on function public.platform_set_telephony_connection_enabled(
  uuid,
  boolean,
  text
)
to authenticated;

notify pgrst, 'reload schema';

commit;
