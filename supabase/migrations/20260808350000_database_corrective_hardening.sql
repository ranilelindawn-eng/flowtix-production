begin;

alter table public.automation_throttle_events enable row level security;

drop policy if exists automation_throttle_events_deny_authenticated
on public.automation_throttle_events;

create policy automation_throttle_events_deny_authenticated
on public.automation_throttle_events
as restrictive
for all
to authenticated
using (false)
with check (false);

revoke all
on table public.automation_throttle_events
from anon, authenticated;

grant all
on table public.automation_throttle_events
to service_role;

do $$
declare
  function_row record;
begin
  for function_row in
    select
      namespace_record.nspname as schema_name,
      procedure_record.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(
        procedure_record.oid
      ) as identity_arguments
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.prosecdef
  loop
    execute pg_catalog.format(
      'revoke execute on function %I.%I(%s) from public',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end
$$;

grant execute on function public.can_access_owned_record(
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated;

grant execute on function public.can_manage_organization_assignments(uuid)
to authenticated;

grant execute on function public.current_organization_membership_id(uuid)
to authenticated;

grant execute on function public.is_active_organization_member(uuid, uuid)
to authenticated;

grant execute on function public.is_organization_member(uuid)
to authenticated;

grant execute on function public.organization_role(uuid)
to authenticated;

alter default privileges in schema public
revoke execute on functions from public;

create table if not exists public.database_constraint_validation_failures (
  constraint_oid oid primary key,
  schema_name text not null,
  table_name text not null,
  constraint_name text not null,
  constraint_type text not null,
  sqlstate text,
  error_message text not null,
  attempted_at timestamptz not null default pg_catalog.now()
);

revoke all
on table public.database_constraint_validation_failures
from public, anon, authenticated;

grant all
on table public.database_constraint_validation_failures
to service_role;

do $$
declare
  pending_constraint record;
  validation_statement text;
begin
  for pending_constraint in
    select
      con.oid as constraint_oid,
      ns.nspname as schema_name,
      tbl.relname as table_name,
      con.conname as constraint_name,
      con.contype as constraint_type
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class tbl
      on tbl.oid = con.conrelid
    join pg_catalog.pg_namespace ns
      on ns.oid = tbl.relnamespace
    where ns.nspname = 'public'
      and not con.convalidated
    order by
      ns.nspname,
      tbl.relname,
      con.conname
  loop
    validation_statement := pg_catalog.format(
      'alter table %I.%I validate constraint %I',
      pending_constraint.schema_name,
      pending_constraint.table_name,
      pending_constraint.constraint_name
    );

    begin
      execute validation_statement;

      delete from public.database_constraint_validation_failures
      where constraint_oid = pending_constraint.constraint_oid;
    exception
      when others then
        insert into public.database_constraint_validation_failures (
          constraint_oid,
          schema_name,
          table_name,
          constraint_name,
          constraint_type,
          sqlstate,
          error_message,
          attempted_at
        )
        values (
          pending_constraint.constraint_oid,
          pending_constraint.schema_name,
          pending_constraint.table_name,
          pending_constraint.constraint_name,
          pending_constraint.constraint_type,
          sqlstate,
          sqlerrm,
          pg_catalog.now()
        )
        on conflict (constraint_oid)
        do update set
          schema_name = excluded.schema_name,
          table_name = excluded.table_name,
          constraint_name = excluded.constraint_name,
          constraint_type = excluded.constraint_type,
          sqlstate = excluded.sqlstate,
          error_message = excluded.error_message,
          attempted_at = excluded.attempted_at;
    end;
  end loop;
end
$$;

create or replace function public.database_constraint_validation_failures_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  failures jsonb;
  failure_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  delete from public.database_constraint_validation_failures failure
  where not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.oid = failure.constraint_oid
      and not constraint_row.convalidated
  );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'schema', schema_name,
          'table', table_name,
          'constraint', constraint_name,
          'type', constraint_type,
          'sqlstate', sqlstate,
          'error', error_message,
          'attemptedAt', attempted_at
        )
        order by schema_name, table_name, constraint_name
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into failures, failure_count
  from public.database_constraint_validation_failures;

  return jsonb_build_object(
    'healthy', failure_count = 0,
    'count', failure_count,
    'failures', failures,
    'checkedAt', pg_catalog.now()
  );
end;
$$;

revoke all
on function public.database_constraint_validation_failures_report()
from public, anon, authenticated;

grant execute
on function public.database_constraint_validation_failures_report()
to service_role;

commit;
