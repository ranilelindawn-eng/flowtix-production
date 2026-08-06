begin;

-- These tables are intentionally internal. Customer and anonymous sessions
-- must not query or mutate them directly. Server-side operations use the
-- service role or vetted SECURITY DEFINER functions.

do $$
declare
  table_name text;
  qualified_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'billing_legacy_archive',
    'contact_inquiries',
    'database_constraint_validation_failures',
    'rate_limit_buckets',
    'rate_limits'
  ]
  loop
    if pg_catalog.to_regclass(
      pg_catalog.format('public.%I', table_name)
    ) is null then
      continue;
    end if;

    qualified_name := pg_catalog.format('public.%I', table_name);
    policy_name := table_name || '_deny_customer_access';

    execute pg_catalog.format(
      'alter table %s enable row level security',
      qualified_name
    );

    execute pg_catalog.format(
      'drop policy if exists %I on %s',
      policy_name,
      qualified_name
    );

    execute pg_catalog.format(
      'create policy %I on %s as restrictive for all ' ||
      'to anon, authenticated using (false) with check (false)',
      policy_name,
      qualified_name
    );

    execute pg_catalog.format(
      'revoke all on table %s from anon, authenticated',
      qualified_name
    );

    execute pg_catalog.format(
      'grant all on table %s to service_role',
      qualified_name
    );
  end loop;
end
$$;

comment on table public.billing_legacy_archive is
  'Service-role-only archive of obsolete billing-provider data retained for audit and rollback evidence.';

comment on table public.contact_inquiries is
  'Service-role-managed public contact submissions. Browser clients submit through the protected Flowtix API only.';

comment on table public.database_constraint_validation_failures is
  'Service-role-only diagnostics for historical constraint validation failures.';

comment on table public.rate_limit_buckets is
  'Internal rate-limit state accessed only through vetted server-side or SECURITY DEFINER operations.';

do $$
begin
  if pg_catalog.to_regclass('public.rate_limits') is not null then
    execute $comment$
      comment on table public.rate_limits is
      'Internal rate-limit configuration/state. Direct customer access is denied.'
    $comment$;
  end if;
end
$$;

create or replace function public.internal_table_security_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_report jsonb;
  insecure_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  with expected(table_name) as (
    values
      ('billing_legacy_archive'::text),
      ('contact_inquiries'::text),
      ('database_constraint_validation_failures'::text),
      ('rate_limit_buckets'::text),
      ('rate_limits'::text)
  ),
  inspected as (
    select
      expected.table_name,
      table_record.oid is not null as exists,
      coalesce(table_record.relrowsecurity, false) as rls_enabled,
      coalesce(policy_state.has_deny_policy, false) as has_deny_policy,
      not coalesce(
        pg_catalog.has_table_privilege(
          'anon',
          table_record.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        ),
        false
      ) as anon_privileges_revoked,
      not coalesce(
        pg_catalog.has_table_privilege(
          'authenticated',
          table_record.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        ),
        false
      ) as authenticated_privileges_revoked
    from expected
    left join pg_catalog.pg_class table_record
      on table_record.relname = expected.table_name
     and table_record.relnamespace =
       pg_catalog.to_regnamespace('public')
     and table_record.relkind in ('r', 'p')
    left join lateral (
      select
        bool_or(
          policy.polroles @> array[
            pg_catalog.to_regrole('anon')::oid,
            pg_catalog.to_regrole('authenticated')::oid
          ]
          and pg_catalog.pg_get_expr(
            policy.polqual,
            policy.polrelid
          ) = 'false'
          and pg_catalog.pg_get_expr(
            policy.polwithcheck,
            policy.polrelid
          ) = 'false'
        ) as has_deny_policy
      from pg_catalog.pg_policy policy
      where policy.polrelid = table_record.oid
    ) policy_state on true
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table', table_name,
          'exists', exists,
          'rlsEnabled', rls_enabled,
          'hasDenyPolicy', has_deny_policy,
          'anonPrivilegesRevoked', anon_privileges_revoked,
          'authenticatedPrivilegesRevoked',
            authenticated_privileges_revoked,
          'healthy',
            not exists
            or (
              rls_enabled
              and has_deny_policy
              and anon_privileges_revoked
              and authenticated_privileges_revoked
            )
        )
        order by table_name
      ),
      '[]'::jsonb
    ),
    count(*) filter (
      where exists
        and not (
          rls_enabled
          and has_deny_policy
          and anon_privileges_revoked
          and authenticated_privileges_revoked
        )
    )::integer
  into table_report, insecure_count
  from inspected;

  return jsonb_build_object(
    'healthy', insecure_count = 0,
    'insecureTableCount', insecure_count,
    'tables', table_report,
    'checkedAt', pg_catalog.now()
  );
end;
$$;

revoke all
on function public.internal_table_security_report()
from public, anon, authenticated;

grant execute
on function public.internal_table_security_report()
to service_role;

commit;
