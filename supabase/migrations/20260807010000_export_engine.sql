begin;

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource text not null check (resource in ('contacts','companies','opportunities','calls','campaigns','tasks','activities')),
  format text not null check (format in ('csv','excel','pdf')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters)='object'),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  row_count bigint not null default 0,
  file_size_bytes bigint not null default 0,
  background_job_id uuid references public.background_jobs(id) on delete set null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists export_jobs_org_created_idx on public.export_jobs(organization_id,created_at desc);
create index if not exists export_jobs_org_status_idx on public.export_jobs(organization_id,status,created_at desc);

create table if not exists public.export_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  resource text not null check (resource in ('contacts','companies','opportunities','calls','campaigns','tasks','activities')),
  format text not null check (format in ('csv','excel','pdf')),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters)='object'),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  timezone text not null default 'UTC',
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists export_schedules_due_idx on public.export_schedules(is_active,next_run_at) where is_active;
create index if not exists export_schedules_org_idx on public.export_schedules(organization_id,created_at desc);

create or replace function public.enqueue_due_export_schedules(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare r record; v_export_id uuid; v_job_id uuid; v_count integer:=0; v_next timestamptz;
begin
  for r in select * from public.export_schedules where is_active and next_run_at<=now() order by next_run_at for update skip locked limit greatest(1,least(p_limit,500)) loop
    insert into public.export_jobs(organization_id,resource,format,filters,status,created_by)
    values(r.organization_id,r.resource,r.format,r.filters,'queued',r.created_by) returning id into v_export_id;
    insert into public.background_jobs(organization_id,queue,job_type,payload,status,priority,scheduled_at,max_attempts,idempotency_key,created_by)
    values(r.organization_id,'reports','exports.generate',jsonb_build_object('exportId',v_export_id,'organizationId',r.organization_id,'resource',r.resource,'format',r.format),'queued',100,now(),5,'scheduled-export:'||r.id||':'||r.next_run_at::text,r.created_by)
    on conflict (organization_id,idempotency_key) where idempotency_key is not null do update set updated_at=public.background_jobs.updated_at
    returning id into v_job_id;
    update public.export_jobs set background_job_id=v_job_id where id=v_export_id;
    v_next:=case r.frequency when 'daily' then r.next_run_at+interval '1 day' when 'weekly' then r.next_run_at+interval '1 week' else r.next_run_at+interval '1 month' end;
    update public.export_schedules set last_run_at=now(),next_run_at=v_next,updated_at=now() where id=r.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end; $$;
revoke all on function public.enqueue_due_export_schedules(integer) from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('exports','exports',false,52428800,array['text/csv','application/vnd.ms-excel','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.export_jobs enable row level security;
alter table public.export_schedules enable row level security;
create policy export_jobs_select_member on public.export_jobs for select to authenticated using(public.is_organization_member(organization_id));
create policy export_jobs_insert_member on public.export_jobs for insert to authenticated with check(created_by=auth.uid() and public.is_organization_member(organization_id));
create policy export_jobs_update_member on public.export_jobs for update to authenticated using(public.is_organization_member(organization_id)) with check(public.is_organization_member(organization_id));
create policy export_schedules_select_member on public.export_schedules for select to authenticated using(public.is_organization_member(organization_id));
create policy export_schedules_insert_member on public.export_schedules for insert to authenticated with check(created_by=auth.uid() and public.is_organization_member(organization_id));
create policy export_schedules_update_member on public.export_schedules for update to authenticated using(public.is_organization_member(organization_id)) with check(public.is_organization_member(organization_id));
create policy export_schedules_delete_member on public.export_schedules for delete to authenticated using(public.is_organization_member(organization_id));

create policy exports_storage_select_member on storage.objects for select to authenticated using(bucket_id='exports' and public.is_organization_member((storage.foldername(name))[1]::uuid));
create policy exports_storage_delete_member on storage.objects for delete to authenticated using(bucket_id='exports' and public.is_organization_member((storage.foldername(name))[1]::uuid));

revoke all on public.export_jobs,public.export_schedules from anon;
grant select,insert,update on public.export_jobs to authenticated;
grant select,insert,update,delete on public.export_schedules to authenticated;

commit;

do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.unschedule('flowtix-export-scheduler') where exists(select 1 from cron.job where jobname='flowtix-export-scheduler');
    perform cron.schedule('flowtix-export-scheduler','*/5 * * * *','select public.enqueue_due_export_schedules(100);');
  end if;
exception when others then null; end $$;
