begin;

-- Dashboard live refresh is read-only. This migration only ensures the
-- organization-scoped source tables are available to Supabase Realtime.
-- Existing RLS policies continue to determine which rows an authenticated
-- organization member is allowed to receive.
do $$
declare
  source_table text;
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach source_table in array array[
      'contacts',
      'calls',
      'campaigns',
      'contact_tasks',
      'opportunities',
      'communication_messages',
      'calendar_events'
    ]
    loop
      if to_regclass(format('public.%I', source_table)) is not null
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = source_table
        )
      then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          source_table
        );
      end if;
    end loop;
  end if;
end
$$;

commit;
