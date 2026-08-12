begin;

-- Flowtix owner-only Data Exports hardening + scheduled/worker completion.
--
-- Security model:
--   * export files are owned by the current workspace owner
--   * Data Exports rows/schedules are readable/writable only by an owner
--   * storage access is owner-only
--   * new files are stored as owner_user_id/organization_id/export_id.ext
--
-- Existing created_by is preserved as an audit field. owner_user_id is the
-- security/storage owner and is backfilled from organization_members.

alter table public.export_jobs
  add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;

alter table public.export_schedules
  add column if not exists owner_user_id uuid references auth.users(id) on delete restrict;

create or replace function public.flowtix_export_owner_id(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.user_id
  from public.organization_members om
  where om.organization_id = p_organization_id
    and om.role::text = 'owner'
    and coalesce(om.status::text, 'active') = 'active'
  order by om.created_at asc
  limit 1
$$;

revoke all on function public.flowtix_export_owner_id(uuid) from public, anon, authenticated;
grant execute on function public.flowtix_export_owner_id(uuid) to service_role;

update public.export_jobs e
set owner_user_id = public.flowtix_export_owner_id(e.organization_id)
where e.owner_user_id is null;

update public.export_schedules s
set owner_user_id = public.flowtix_export_owner_id(s.organization_id)
where s.owner_user_id is null;

do $$
begin
  if exists (select 1 from public.export_jobs where owner_user_id is null) then
    raise exception 'Cannot harden export_jobs: at least one organization has no active owner';
  end if;

  if exists (select 1 from public.export_schedules where owner_user_id is null) then
    raise exception 'Cannot harden export_schedules: at least one organization has no active owner';
  end if;
end
$$;

alter table public.export_jobs alter column owner_user_id set not null;
alter table public.export_schedules alter column owner_user_id set not null;

create index if not exists export_jobs_owner_created_idx
  on public.export_jobs(owner_user_id, organization_id, created_at desc);

create index if not exists export_schedules_owner_created_idx
  on public.export_schedules(owner_user_id, organization_id, created_at desc);

-- Replace member-wide RLS with owner-only RLS.
drop policy if exists export_jobs_select_member on public.export_jobs;
drop policy if exists export_jobs_insert_member on public.export_jobs;
drop policy if exists export_jobs_update_member on public.export_jobs;
drop policy if exists export_jobs_delete_member on public.export_jobs;

drop policy if exists export_schedules_select_member on public.export_schedules;
drop policy if exists export_schedules_insert_member on public.export_schedules;
drop policy if exists export_schedules_update_member on public.export_schedules;
drop policy if exists export_schedules_delete_member on public.export_schedules;

create policy export_jobs_select_owner
  on public.export_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_jobs_insert_owner
  on public.export_jobs
  for insert
  to authenticated
  with check (
    owner_user_id = auth.uid()
    and created_by = auth.uid()
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_jobs_update_owner
  on public.export_jobs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  )
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_jobs_delete_owner
  on public.export_jobs
  for delete
  to authenticated
  using (
    status not in ('queued', 'processing')
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_schedules_select_owner
  on public.export_schedules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_schedules.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_schedules_insert_owner
  on public.export_schedules
  for insert
  to authenticated
  with check (
    owner_user_id = auth.uid()
    and created_by = auth.uid()
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_schedules.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_schedules_update_owner
  on public.export_schedules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_schedules.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  )
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_schedules.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

create policy export_schedules_delete_owner
  on public.export_schedules
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = export_schedules.organization_id
        and om.user_id = auth.uid()
        and om.role::text = 'owner'
        and coalesce(om.status::text, 'active') = 'active'
    )
  );

-- Storage access is no longer based on generic organization membership.
drop policy if exists exports_storage_select_member on storage.objects;
drop policy if exists exports_storage_delete_member on storage.objects;
drop policy if exists exports_storage_select_owner on storage.objects;
drop policy if exists exports_storage_delete_owner on storage.objects;

create policy exports_storage_select_owner
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'exports'
    and exists (
      select 1
      from public.export_jobs e
      join public.organization_members om
        on om.organization_id = e.organization_id
       and om.user_id = auth.uid()
       and om.role::text = 'owner'
       and coalesce(om.status::text, 'active') = 'active'
      where coalesce(e.storage_bucket, 'exports') = storage.objects.bucket_id
        and e.storage_path = storage.objects.name
    )
  );

create policy exports_storage_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exports'
    and exists (
      select 1
      from public.export_jobs e
      join public.organization_members om
        on om.organization_id = e.organization_id
       and om.user_id = auth.uid()
       and om.role::text = 'owner'
       and coalesce(om.status::text, 'active') = 'active'
      where coalesce(e.storage_bucket, 'exports') = storage.objects.bucket_id
        and e.storage_path = storage.objects.name
    )
  );

-- Rebuild the recurring scheduler so each generated export is assigned to the
-- current active workspace owner, even if the schedule is old.
create or replace function public.enqueue_due_export_schedules(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_owner_id uuid;
  v_export_id uuid;
  v_job_id uuid;
  v_count integer := 0;
  v_next timestamptz;
begin
  for r in
    select *
    from public.export_schedules
    where is_active
      and next_run_at <= now()
    order by next_run_at
    for update skip locked
    limit greatest(1, least(p_limit, 500))
  loop
    v_owner_id := public.flowtix_export_owner_id(r.organization_id);

    if v_owner_id is null then
      update public.export_schedules
      set is_active = false,
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    update public.export_schedules
    set owner_user_id = v_owner_id,
        updated_at = now()
    where id = r.id;

    insert into public.export_jobs(
      organization_id,
      owner_user_id,
      resource,
      format,
      filters,
      status,
      created_by
    )
    values(
      r.organization_id,
      v_owner_id,
      r.resource,
      r.format,
      r.filters,
      'queued',
      v_owner_id
    )
    returning id into v_export_id;

    insert into public.background_jobs(
      organization_id,
      queue,
      job_type,
      payload,
      status,
      priority,
      scheduled_at,
      max_attempts,
      idempotency_key,
      created_by
    )
    values(
      r.organization_id,
      'reports',
      'exports.generate',
      jsonb_build_object(
        'exportId', v_export_id,
        'organizationId', r.organization_id,
        'resource', r.resource,
        'format', r.format,
        'filters', r.filters
      ),
      'queued',
      100,
      now(),
      5,
      'scheduled-export:' || r.id || ':' || r.next_run_at::text,
      v_owner_id
    )
    on conflict (organization_id, idempotency_key)
      where idempotency_key is not null
    do update set updated_at = public.background_jobs.updated_at
    returning id into v_job_id;

    update public.export_jobs
    set background_job_id = v_job_id,
        updated_at = now()
    where id = v_export_id;

    v_next := case r.frequency
      when 'daily' then r.next_run_at + interval '1 day'
      when 'weekly' then r.next_run_at + interval '1 week'
      else r.next_run_at + interval '1 month'
    end;

    update public.export_schedules
    set last_run_at = now(),
        next_run_at = v_next,
        owner_user_id = v_owner_id,
        updated_at = now()
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_due_export_schedules(integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_export_schedules(integer)
  to service_role;

commit;

notify pgrst, 'reload schema';
