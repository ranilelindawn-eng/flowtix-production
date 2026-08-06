begin;

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
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname,
          'constraint', con.conname,
          'type', con.contype,
          'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
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
          'identityArguments', pg_catalog.pg_get_function_identity_arguments(p.oid)
        )
        order by n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into public_security_definers, public_security_definer_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and pg_catalog.has_function_privilege(
      'public',
      p.oid,
      'EXECUTE'
    );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', n.nspname,
          'function', p.proname,
          'identityArguments', pg_catalog.pg_get_function_identity_arguments(p.oid)
        )
        order by n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
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
      from unnest(coalesce(p.proconfig, array[]::text[])) setting
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
        and (i.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
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
            from unnest(conkey) with ordinality as u(attnum, ordinality)
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
      x.indexrelid,
      x.indisunique,
      x.indisprimary,
      x.indkey,
      x.indexprs,
      x.indpred,
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
      'publicExecutableSecurityDefiners', public_security_definer_count,
      'securityDefinersWithoutSearchPath', unsafe_security_definer_count,
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

create or replace function public.database_constraint_validation_plan()
returns table (
  schema_name text,
  table_name text,
  constraint_name text,
  constraint_type text,
  validation_sql text
)
language sql
security definer
set search_path = ''
as $$
  select
    n.nspname::text,
    c.relname::text,
    con.conname::text,
    case con.contype
      when 'c' then 'check'
      when 'f' then 'foreign_key'
      else con.contype::text
    end,
    format(
      'alter table %I.%I validate constraint %I;',
      n.nspname,
      c.relname,
      con.conname
    )
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not con.convalidated
  order by n.nspname, c.relname, con.conname;
$$;

revoke all on function public.database_constraint_validation_plan()
from public, anon, authenticated;

grant execute on function public.database_constraint_validation_plan()
to service_role;

commit;
