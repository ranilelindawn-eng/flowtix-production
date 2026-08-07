-- Flowtix Phase 2.6 — Provider & Usage Validation
--
-- Read-only acceptance checks for Telephony + AI provider state, usage ledgers,
-- and credential-exposure boundaries.
--
-- This migration does not modify provider credentials, routing, calls, AI
-- requests, customer usage quotas, or provider configuration.

begin;

create or replace function public.platform_provider_usage_security_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  telephony_integrations bigint;
  telephony_connected bigint;
  telephony_enabled bigint;
  connected_missing_secret bigint;
  secret_org_mismatch bigint;
  phone_numbers_without_integration bigint;
  calls_24h bigint;
  failed_calls_24h bigint;
  telephony_verification_failures_24h bigint;

  ai_requests_month bigint;
  ai_completed_month bigint;
  ai_failed_month bigint;
  ai_reserved bigint;
  ai_expired_still_reserved bigint;
  ai_completed_missing_provider bigint;
  ai_completed_missing_model bigint;
  ai_orgs_month bigint;
  ai_verification_failures_24h bigint;

  encrypted_secret_rows bigint;
  authenticated_can_select_secrets boolean;
  platform_rpc_secret_reference_count bigint;
  sensitive_platform_setting_keys bigint;

  critical_count bigint;
  warning_count bigint;
  score_value integer;
  findings jsonb := '[]'::jsonb;
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
    raise exception 'PLATFORM_PROVIDER_VALIDATION_DENIED'
      using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (
      where integration.status = 'connected'
    ),
    count(*) filter (
      where integration.enabled = true
    )
  into
    telephony_integrations,
    telephony_connected,
    telephony_enabled
  from public.organization_integrations integration
  where integration.provider in (
    'twilio',
    'telnyx',
    'signalwire',
    'plivo'
  );

  select count(*)
  into connected_missing_secret
  from public.organization_integrations integration
  left join public.organization_integration_secrets secret
    on secret.integration_id = integration.id
   and secret.organization_id = integration.organization_id
  where integration.provider in (
      'twilio',
      'telnyx',
      'signalwire',
      'plivo'
    )
    and integration.status = 'connected'
    and integration.enabled = true
    and secret.id is null;

  select count(*)
  into secret_org_mismatch
  from public.organization_integration_secrets secret
  join public.organization_integrations integration
    on integration.id = secret.integration_id
  where secret.organization_id <> integration.organization_id;

  select count(*)
  into phone_numbers_without_integration
  from public.organization_phone_numbers phone
  where phone.provider in (
      'twilio',
      'telnyx',
      'signalwire',
      'plivo'
    )
    and not exists (
      select 1
      from public.organization_integrations integration
      where integration.organization_id = phone.organization_id
        and integration.provider = phone.provider
    );

  select
    count(*),
    count(*) filter (
      where call_row.status in ('failed', 'cancelled')
    )
  into calls_24h, failed_calls_24h
  from public.calls call_row
  where call_row.started_at >= pg_catalog.now() - interval '24 hours'
    and call_row.provider in (
      'twilio',
      'telnyx',
      'signalwire',
      'plivo'
    );

  select count(*)
  into telephony_verification_failures_24h
  from public.platform_telephony_health_checks health
  where health.created_at >= pg_catalog.now() - interval '24 hours'
    and health.status = 'failed';

  select
    count(*),
    count(*) filter (where usage.status = 'completed'),
    count(*) filter (where usage.status = 'failed'),
    count(distinct usage.organization_id)
  into
    ai_requests_month,
    ai_completed_month,
    ai_failed_month,
    ai_orgs_month
  from public.ai_usage_reservations usage
  where usage.created_at >= date_trunc('month', pg_catalog.now());

  select count(*)
  into ai_reserved
  from public.ai_usage_reservations usage
  where usage.status = 'reserved';

  select count(*)
  into ai_expired_still_reserved
  from public.ai_usage_reservations usage
  where usage.status = 'reserved'
    and usage.expires_at <= pg_catalog.now();

  select count(*)
  into ai_completed_missing_provider
  from public.ai_usage_reservations usage
  where usage.status = 'completed'
    and nullif(pg_catalog.btrim(coalesce(usage.provider, '')), '') is null;

  select count(*)
  into ai_completed_missing_model
  from public.ai_usage_reservations usage
  where usage.status = 'completed'
    and nullif(pg_catalog.btrim(coalesce(usage.model, '')), '') is null;

  select count(*)
  into ai_verification_failures_24h
  from public.platform_ai_health_checks health
  where health.created_at >= pg_catalog.now() - interval '24 hours'
    and health.status = 'failed';

  select count(*)
  into encrypted_secret_rows
  from public.organization_integration_secrets;

  authenticated_can_select_secrets :=
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.organization_integration_secrets',
      'SELECT'
    );

  select count(*)
  into platform_rpc_secret_reference_count
  from pg_proc procedure
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and (
      procedure.proname like 'platform\_telephony\_%' escape '\'
      or procedure.proname like 'platform\_ai\_%' escape '\'
      or procedure.proname = 'platform_provider_usage_security_report'
    )
    and procedure.proname <> 'platform_provider_usage_security_report'
    and pg_get_functiondef(procedure.oid) ilike '%encrypted_credentials%';

  select count(*)
  into sensitive_platform_setting_keys
  from public.platform_settings setting
  where lower(setting.setting_key) like '%secret%'
     or lower(setting.setting_key) like '%password%'
     or lower(setting.setting_key) like '%token%'
     or lower(setting.setting_key) like '%credential%'
     or lower(setting.setting_key) like '%api_key%'
     or lower(setting.setting_key) like '%apikey%';

  if connected_missing_secret > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'connected_telephony_missing_secret',
        'severity', 'critical',
        'count', connected_missing_secret,
        'message', 'Connected telephony integrations are missing their encrypted credential row.'
      )
    );
  end if;

  if secret_org_mismatch > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'telephony_secret_organization_mismatch',
        'severity', 'critical',
        'count', secret_org_mismatch,
        'message', 'Integration-secret rows do not match the owning integration organization.'
      )
    );
  end if;

  if phone_numbers_without_integration > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'phone_numbers_without_integration',
        'severity', 'warning',
        'count', phone_numbers_without_integration,
        'message', 'Customer phone-number rows exist without a matching organization provider integration.'
      )
    );
  end if;

  if ai_expired_still_reserved > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'expired_ai_usage_reservation',
        'severity', 'warning',
        'count', ai_expired_still_reserved,
        'message', 'Expired AI usage reservations are still marked reserved and should be cleaned by the normal reservation lifecycle.'
      )
    );
  end if;

  if ai_completed_missing_provider > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'completed_ai_usage_missing_provider',
        'severity', 'warning',
        'count', ai_completed_missing_provider,
        'message', 'Completed AI usage rows are missing the provider used for the request.'
      )
    );
  end if;

  if ai_completed_missing_model > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'completed_ai_usage_missing_model',
        'severity', 'warning',
        'count', ai_completed_missing_model,
        'message', 'Completed AI usage rows are missing the model used for the request.'
      )
    );
  end if;

  if platform_rpc_secret_reference_count > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'platform_provider_rpc_secret_reference',
        'severity', 'critical',
        'count', platform_rpc_secret_reference_count,
        'message', 'A Platform AI/Telephony RPC references the encrypted credential column and must be reviewed for secret exposure.'
      )
    );
  end if;

  if sensitive_platform_setting_keys > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'sensitive_platform_setting_key',
        'severity', 'critical',
        'count', sensitive_platform_setting_keys,
        'message', 'Secret-like keys were found in ordinary Platform Settings; provider credentials must remain in encrypted/server secret storage.'
      )
    );
  end if;

  if authenticated_can_select_secrets then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'authenticated_ciphertext_select',
        'severity', 'warning',
        'count', encrypted_secret_rows,
        'message', 'Authenticated customer admins can RLS-read encrypted integration ciphertext. Plaintext is not exposed, but direct ciphertext SELECT should be removed during the dedicated Phase 2.8 security hardening pass.'
      )
    );
  end if;

  select
    count(*) filter (
      where finding.value ->> 'severity' = 'critical'
    ),
    count(*) filter (
      where finding.value ->> 'severity' = 'warning'
    )
  into critical_count, warning_count
  from jsonb_array_elements(findings) finding(value);

  score_value := greatest(
    0,
    100
      - least(80, critical_count::integer * 25)
      - least(20, warning_count::integer * 5)
  );

  return jsonb_build_object(
    'healthy', critical_count = 0 and warning_count = 0,
    'score', score_value,
    'checkedAt', pg_catalog.now(),
    'telephony', jsonb_build_object(
      'integrations', telephony_integrations,
      'connected', telephony_connected,
      'enabled', telephony_enabled,
      'connectedMissingSecret', connected_missing_secret,
      'secretOrganizationMismatch', secret_org_mismatch,
      'phoneNumbersWithoutIntegration', phone_numbers_without_integration,
      'callsLast24Hours', calls_24h,
      'failedCallsLast24Hours', failed_calls_24h,
      'verificationFailuresLast24Hours',
        telephony_verification_failures_24h
    ),
    'ai', jsonb_build_object(
      'requestsThisMonth', ai_requests_month,
      'completedThisMonth', ai_completed_month,
      'failedThisMonth', ai_failed_month,
      'reserved', ai_reserved,
      'expiredStillReserved', ai_expired_still_reserved,
      'completedMissingProvider', ai_completed_missing_provider,
      'completedMissingModel', ai_completed_missing_model,
      'organizationsUsingAIThisMonth', ai_orgs_month,
      'verificationFailuresLast24Hours',
        ai_verification_failures_24h
    ),
    'secrets', jsonb_build_object(
      'encryptedIntegrationSecretRows', encrypted_secret_rows,
      'authenticatedCanSelectEncryptedSecrets',
        authenticated_can_select_secrets,
      'platformRpcSecretReferenceCount',
        platform_rpc_secret_reference_count,
      'sensitivePlatformSettingKeys',
        sensitive_platform_setting_keys
    ),
    'findings', findings
  );
end;
$function$;

revoke all on function public.platform_provider_usage_security_report()
from public, anon;

grant execute on function public.platform_provider_usage_security_report()
to authenticated;

comment on function public.platform_provider_usage_security_report() is
  'Read-only Flowtix Platform acceptance report for Telephony/AI provider state, usage consistency, and credential-exposure boundaries.';

notify pgrst, 'reload schema';

commit;
