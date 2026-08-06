begin;

create or replace function public.database_rls_integrity_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tables_without_rls jsonb;
  tenant_tables_without_policies jsonb;
  permissive_public_functions jsonb;
  cross_tenant_role_assignments bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select coalesce(
    jsonb_agg(
      format('%I.%I', n.nspname, c.relname)
      order by c.relname
    ),
    '[]'::jsonb
  )
  into tables_without_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'organization_id'
        and not a.attisdropped
    )
    and not c.relrowsecurity;

  select coalesce(
    jsonb_agg(
      format('%I.%I', n.nspname, c.relname)
      order by c.relname
    ),
    '[]'::jsonb
  )
  into tenant_tables_without_policies
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'organization_id'
        and not a.attisdropped
    )
    and c.relrowsecurity
    and not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = c.oid
    );

  select coalesce(
    jsonb_agg(
      pg_catalog.format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
      )
      order by n.nspname, p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  )
  into permissive_public_functions
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      p.proacl is null
      or exists (
        select 1
        from pg_catalog.aclexplode(p.proacl) privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
    );

  select count(*)
  into cross_tenant_role_assignments
  from public.organization_member_roles assignment
  join public.organization_members membership
    on membership.id = assignment.membership_id
  join public.organization_roles role_record
    on role_record.id = assignment.role_id
  where assignment.organization_id <> membership.organization_id
     or assignment.organization_id <> role_record.organization_id;

  return jsonb_build_object(
    'checkedAt', pg_catalog.now(),
    'tablesWithoutRls', tables_without_rls,
    'tenantTablesWithoutPolicies', tenant_tables_without_policies,
    'securityDefinerFunctionsExecutableByPublic',
      permissive_public_functions,
    'crossTenantRoleAssignments', cross_tenant_role_assignments,
    'healthy',
      jsonb_array_length(tables_without_rls) = 0
      and jsonb_array_length(tenant_tables_without_policies) = 0
      and jsonb_array_length(permissive_public_functions) = 0
      and cross_tenant_role_assignments = 0
  );
end;
$$;

revoke all on function public.database_rls_integrity_report()
from public, anon, authenticated;

grant execute on function public.database_rls_integrity_report()
to service_role;

create or replace function public.database_schema_acceptance_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invalid_constraints jsonb;
  invalid_indexes jsonb;
  disabled_triggers jsonb;
  rls_without_policies jsonb;
  public_security_definers jsonb;
  unsafe_security_definers jsonb;
  unindexed_foreign_keys jsonb;
  duplicate_indexes jsonb;
  invalid_constraint_count integer;
  invalid_index_count integer;
  disabled_trigger_count integer;
  rls_without_policy_count integer;
  public_security_definer_count integer;
  unsafe_security_definer_count integer;
  unindexed_foreign_key_count integer;
  duplicate_index_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname,
          'constraint', con.conname,
          'type', con.contype,
          'definition',
            pg_catalog.pg_get_constraintdef(con.oid, true)
        )
        order by n.nspname, c.relname, con.conname
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into invalid_constraints, invalid_constraint_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not con.convalidated;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname,
          'index', i.relname
        )
        order by n.nspname, c.relname, i.relname
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into invalid_indexes, invalid_index_count
  from pg_catalog.pg_index x
  join pg_catalog.pg_class i on i.oid = x.indexrelid
  join pg_catalog.pg_class c on c.oid = x.indrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (not x.indisvalid or not x.indisready);

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname,
          'trigger', t.tgname
        )
        order by n.nspname, c.relname, t.tgname
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into disabled_triggers, disabled_trigger_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgenabled = 'D';

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname
        )
        order by n.nspname, c.relname
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into rls_without_policies, rls_without_policy_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relrowsecurity
    and not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = c.oid
    );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'function', p.proname,
          'identityArguments',
            pg_catalog.pg_get_function_identity_arguments(p.oid)
        )
        order by n.nspname, p.proname,
          pg_catalog.pg_get_function_identity_arguments(p.oid)
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into public_security_definers, public_security_definer_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      p.proacl is null
      or exists (
        select 1
        from pg_catalog.aclexplode(p.proacl) privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
    );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'function', p.proname,
          'identityArguments',
            pg_catalog.pg_get_function_identity_arguments(p.oid)
        )
        order by n.nspname, p.proname,
          pg_catalog.pg_get_function_identity_arguments(p.oid)
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into unsafe_security_definers, unsafe_security_definer_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1
      from unnest(
        coalesce(p.proconfig, array[]::text[])
      ) setting
      where setting like 'search_path=%'
    );

  with foreign_keys as (
    select
      con.oid,
      con.conrelid,
      con.conname,
      con.conkey,
      n.nspname,
      c.relname
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and con.contype = 'f'
  ),
  missing as (
    select fk.*
    from foreign_keys fk
    where not exists (
      select 1
      from pg_catalog.pg_index i
      where i.indrelid = fk.conrelid
        and i.indisvalid
        and i.indisready
        and i.indpred is null
        and i.indnkeyatts >= cardinality(fk.conkey)
        and (
          select array_agg(key_column order by key_order)
          from unnest(i.indkey::smallint[])
            with ordinality indexed(key_column, key_order)
          where key_order <= cardinality(fk.conkey)
        ) = fk.conkey
    )
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', nspname,
          'table', relname,
          'constraint', conname,
          'columns', (
            select jsonb_agg(a.attname order by u.ordinality)
            from unnest(conkey)
              with ordinality as u(attnum, ordinality)
            join pg_catalog.pg_attribute a
              on a.attrelid = conrelid
             and a.attnum = u.attnum
          )
        )
        order by nspname, relname, conname
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into unindexed_foreign_keys, unindexed_foreign_key_count
  from missing;

  with index_signatures as (
    select
      x.indrelid,
      x.indisunique,
      x.indkey,
      n.nspname,
      c.relname,
      i.relname as index_name,
      count(*) over (
        partition by
          x.indrelid,
          x.indisunique,
          x.indkey,
          pg_catalog.pg_get_expr(x.indexprs, x.indrelid),
          pg_catalog.pg_get_expr(x.indpred, x.indrelid)
      ) as signature_count
    from pg_catalog.pg_index x
    join pg_catalog.pg_class c on c.oid = x.indrelid
    join pg_catalog.pg_class i on i.oid = x.indexrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and x.indisvalid
      and x.indisready
      and not x.indisprimary
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', nspname,
          'table', relname,
          'index', index_name
        )
        order by nspname, relname, index_name
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into duplicate_indexes, duplicate_index_count
  from index_signatures
  where signature_count > 1;

  return jsonb_build_object(
    'healthy',
      invalid_constraint_count = 0
      and invalid_index_count = 0
      and disabled_trigger_count = 0
      and rls_without_policy_count = 0
      and public_security_definer_count = 0
      and unsafe_security_definer_count = 0,
    'summary', jsonb_build_object(
      'invalidConstraints', invalid_constraint_count,
      'invalidIndexes', invalid_index_count,
      'disabledTriggers', disabled_trigger_count,
      'rlsTablesWithoutPolicies', rls_without_policy_count,
      'publicExecutableSecurityDefiners',
        public_security_definer_count,
      'securityDefinersWithoutSearchPath',
        unsafe_security_definer_count,
      'unindexedForeignKeys', unindexed_foreign_key_count,
      'duplicateIndexes', duplicate_index_count
    ),
    'invalidConstraints', invalid_constraints,
    'invalidIndexes', invalid_indexes,
    'disabledTriggers', disabled_triggers,
    'rlsTablesWithoutPolicies', rls_without_policies,
    'publicExecutableSecurityDefiners', public_security_definers,
    'securityDefinersWithoutSearchPath', unsafe_security_definers,
    'unindexedForeignKeys', unindexed_foreign_keys,
    'duplicateIndexes', duplicate_indexes,
    'checkedAt', pg_catalog.now()
  );
end;
$$;

revoke all on function public.database_schema_acceptance_report()
from public, anon, authenticated;

grant execute on function public.database_schema_acceptance_report()
to service_role;

commit;
