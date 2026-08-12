begin;

-- Flowtix Data Exports upgrade
-- Expands the existing logical export-resource allowlist while preserving
-- tenant isolation and the durable background-job architecture.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'export_jobs'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%resource%'
  loop
    execute format(
      'alter table public.export_jobs drop constraint %I',
      constraint_record.conname
    );
  end loop;

  for constraint_record in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'export_schedules'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%resource%'
  loop
    execute format(
      'alter table public.export_schedules drop constraint %I',
      constraint_record.conname
    );
  end loop;
end
$$;

alter table public.export_jobs
  add constraint export_jobs_resource_check
  check (
    resource in (
      'contacts',
      'companies',
      'opportunities',
      'calls',
      'campaigns',
      'tasks',
      'activities',
      'recordings',
      'transcripts',
      'sales_analytics',
      'call_analytics',
      'agent_analytics',
      'campaign_analytics'
    )
  );

alter table public.export_schedules
  add constraint export_schedules_resource_check
  check (
    resource in (
      'contacts',
      'companies',
      'opportunities',
      'calls',
      'campaigns',
      'tasks',
      'activities',
      'recordings',
      'transcripts',
      'sales_analytics',
      'call_analytics',
      'agent_analytics',
      'campaign_analytics'
    )
  );

drop policy if exists export_jobs_delete_member on public.export_jobs;

create policy export_jobs_delete_member
  on public.export_jobs
  for delete
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and status not in ('queued', 'processing')
  );

grant delete on public.export_jobs to authenticated;

commit;

notify pgrst, 'reload schema';
