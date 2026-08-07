-- Flowtix Phase 2.8 — Platform Audit & Security Hardening
--
-- Removes direct authenticated access to encrypted integration ciphertext after
-- the application secret readers/writers are migrated to server-only service-role
-- accessors. Also hardens Platform RPC exposure and audit immutability.

begin;

-- Encrypted provider/OAuth credentials are server-only.
revoke all on table public.organization_integration_secrets
from public, anon, authenticated;

grant all on table public.organization_integration_secrets
to service_role;

-- Keep RLS enabled as defense in depth even though browser-facing roles no
-- longer have direct table privileges.
alter table public.organization_integration_secrets enable row level security;

-- Platform audit records are append-only from application code.
revoke all on table public.platform_audit_logs
from public, anon, authenticated;

grant all on table public.platform_audit_logs
to service_role;

create or replace function public.prevent_platform_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    if auth.role() <> 'service_role' then
      raise exception 'PLATFORM_AUDIT_LOG_IMMUTABLE'
        using errcode = '42501';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function public.prevent_platform_audit_mutation()
from public, anon, authenticated;

drop trigger if exists platform_audit_logs_immutable_trigger
on public.platform_audit_logs;

create trigger platform_audit_logs_immutable_trigger
before update or delete
on public.platform_audit_logs
for each row
execute function public.prevent_platform_audit_mutation();

-- Remove default/public execution paths from every current Platform RPC while
-- preserving role-specific grants already established by earlier migrations.
do $block$
declare
  function_row record;
begin
  for function_row in
    select
      procedure.oid,
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'platform\_%' escape '\'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end;
$block$;

create or replace function public.platform_security_json_has_secret_key(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  item record;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for item in select key, value from jsonb_each(p_value)
    loop
      if lower(item.key) like '%password%'
         or lower(item.key) like '%secret%'
         or lower(item.key) like '%token%'
         or lower(item.key) like '%credential%'
         or lower(item.key) like '%api_key%'
         or lower(item.key) like '%apikey%'
         or lower(item.key) = 'authorization' then
        return true;
      end if;

      if public.platform_security_json_has_secret_key(item.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for item in select value from jsonb_array_elements(p_value)
    loop
      if public.platform_security_json_has_secret_key(item.value) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$function$;

revoke all on function public.platform_security_json_has_secret_key(jsonb)
from public, anon, authenticated;

grant execute on function public.platform_security_json_has_secret_key(jsonb)
to service_role;

create or replace function public.platform_security_hardening_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  encrypted_secret_rows bigint;
  authenticated_table_privileges bigint;
  anon_table_privileges bigint;
  secret_like_platform_settings bigint;
  platform_rpc_secret_references bigint;

  audit_events bigint;
  audit_update_delete_privileges bigint;
  immutable_trigger_installed boolean;
  secret_like_audit_keys bigint;

  public_platform_function_privileges bigint;
  anon_platform_function_privileges bigint;
  public_sensitive_function_privileges bigint;

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
    raise exception 'PLATFORM_SECURITY_VALIDATION_DENIED'
      using errcode = '42501';
  end if;

  select count(*)
  into encrypted_secret_rows
  from public.organization_integration_secrets;

  authenticated_table_privileges :=
    case
      when pg_catalog.has_table_privilege(
        'authenticated',
        'public.organization_integration_secrets',
        'SELECT,INSERT,UPDATE,DELETE'
      ) then 1
      else 0
    end;

  anon_table_privileges :=
    case
      when pg_catalog.has_table_privilege(
        'anon',
        'public.organization_integration_secrets',
        'SELECT,INSERT,UPDATE,DELETE'
      ) then 1
      else 0
    end;

  select count(*)
  into secret_like_platform_settings
  from public.platform_settings setting
  where lower(setting.setting_key) like '%secret%'
     or lower(setting.setting_key) like '%password%'
     or lower(setting.setting_key) like '%token%'
     or lower(setting.setting_key) like '%credential%'
     or lower(setting.setting_key) like '%api_key%'
     or lower(setting.setting_key) like '%apikey%';

  select count(*)
  into platform_rpc_secret_references
  from pg_proc procedure
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname like 'platform\_%' escape '\'
    and procedure.proname not in (
      'platform_security_hardening_report',
      'platform_provider_usage_security_report'
    )
    and pg_get_functiondef(procedure.oid) ilike '%encrypted_credentials%';

  select count(*)
  into audit_events
  from public.platform_audit_logs;

  audit_update_delete_privileges :=
    case
      when pg_catalog.has_table_privilege(
        'authenticated',
        'public.platform_audit_logs',
        'UPDATE,DELETE'
      ) then 1
      else 0
    end;

  select exists (
    select 1
    from pg_trigger trigger_row
    join pg_class relation
      on relation.oid = trigger_row.tgrelid
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'platform_audit_logs'
      and trigger_row.tgname = 'platform_audit_logs_immutable_trigger'
      and not trigger_row.tgisinternal
  )
  into immutable_trigger_installed;

  select count(*)
  into secret_like_audit_keys
  from public.platform_audit_logs audit
  where public.platform_security_json_has_secret_key(audit.previous_state)
     or public.platform_security_json_has_secret_key(audit.resulting_state)
     or public.platform_security_json_has_secret_key(audit.metadata);

  select count(*)
  into public_platform_function_privileges
  from pg_proc procedure
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname like 'platform\_%' escape '\'
    and pg_catalog.has_function_privilege(
      'public',
      procedure.oid,
      'EXECUTE'
    );

  select count(*)
  into anon_platform_function_privileges
  from pg_proc procedure
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname like 'platform\_%' escape '\'
    and pg_catalog.has_function_privilege(
      'anon',
      procedure.oid,
      'EXECUTE'
    );

  select count(*)
  into public_sensitive_function_privileges
  from pg_proc procedure
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and (
      procedure.proname like '%secret%'
      or procedure.proname like '%imperson%'
      or procedure.proname like '%support_session%'
      or procedure.proname like '%billing%'
      or procedure.proname like '%feature_flag%'
    )
    and pg_catalog.has_function_privilege(
      'public',
      procedure.oid,
      'EXECUTE'
    );

  if authenticated_table_privileges > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'authenticated_integration_secret_access',
        'severity', 'critical',
        'count', authenticated_table_privileges,
        'message', 'Authenticated browser-facing users still have direct privileges on encrypted integration secrets.'
      )
    );
  end if;

  if anon_table_privileges > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'anonymous_integration_secret_access',
        'severity', 'critical',
        'count', anon_table_privileges,
        'message', 'Anonymous users have direct privileges on encrypted integration secrets.'
      )
    );
  end if;

  if secret_like_platform_settings > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'secret_like_platform_settings',
        'severity', 'critical',
        'count', secret_like_platform_settings,
        'message', 'Secret-like keys exist in ordinary Platform Settings.'
      )
    );
  end if;

  if platform_rpc_secret_references > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'platform_rpc_secret_reference',
        'severity', 'critical',
        'count', platform_rpc_secret_references,
        'message', 'Platform RPC definitions reference encrypted credential values.'
      )
    );
  end if;

  if audit_update_delete_privileges > 0 or not immutable_trigger_installed then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'platform_audit_mutability',
        'severity', 'critical',
        'count', audit_update_delete_privileges + case when immutable_trigger_installed then 0 else 1 end,
        'message', 'Platform audit history is not fully protected against authenticated update/delete.'
      )
    );
  end if;

  if secret_like_audit_keys > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'secret_like_audit_payload',
        'severity', 'warning',
        'count', secret_like_audit_keys,
        'message', 'Historical Platform audit JSON contains secret-like key names and should be reviewed.'
      )
    );
  end if;

  if public_platform_function_privileges > 0
     or anon_platform_function_privileges > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'platform_rpc_public_execute',
        'severity', 'critical',
        'count', public_platform_function_privileges + anon_platform_function_privileges,
        'message', 'Platform RPCs still expose EXECUTE to public or anon roles.'
      )
    );
  end if;

  if public_sensitive_function_privileges > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'sensitive_rpc_public_execute',
        'severity', 'warning',
        'count', public_sensitive_function_privileges,
        'message', 'Sensitive public-schema RPCs still expose EXECUTE to the public role and need review.'
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
    'secrets', jsonb_build_object(
      'encryptedSecretRows', encrypted_secret_rows,
      'authenticatedTablePrivileges', authenticated_table_privileges,
      'anonTablePrivileges', anon_table_privileges,
      'browserReadableCiphertext', authenticated_table_privileges > 0,
      'secretLikePlatformSettings', secret_like_platform_settings,
      'platformRpcSecretReferences', platform_rpc_secret_references
    ),
    'audit', jsonb_build_object(
      'events', audit_events,
      'updateDeletePrivileges', audit_update_delete_privileges,
      'immutableTriggerInstalled', immutable_trigger_installed,
      'secretLikeAuditKeys', secret_like_audit_keys
    ),
    'rpc', jsonb_build_object(
      'publicPlatformFunctionPrivileges', public_platform_function_privileges,
      'anonPlatformFunctionPrivileges', anon_platform_function_privileges,
      'publicSensitiveFunctionPrivileges', public_sensitive_function_privileges
    ),
    'findings', findings
  );
end;
$function$;

revoke all on function public.platform_security_hardening_report()
from public, anon;

grant execute on function public.platform_security_hardening_report()
to authenticated;

notify pgrst, 'reload schema';

commit;
