begin;

create table if not exists public.database_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  operation text not null check (operation in ('analyze', 'vacuum', 'index_review', 'statistics_refresh')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  tables_processed integer not null default 0,
  duration_ms integer,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contacts_org_updated_idx
  on public.contacts (organization_id, updated_at desc);

create index if not exists opportunities_org_updated_idx
  on public.opportunities (organization_id, updated_at desc);

create index if not exists background_jobs_queue_status_schedule_idx
  on public.background_jobs (queue, status, scheduled_at);

create index if not exists audit_logs_org_created_idx
  on public.audit_logs (organization_id, created_at desc);

alter table public.database_maintenance_runs enable row level security;

drop policy if exists database_maintenance_runs_select
  on public.database_maintenance_runs;

create policy database_maintenance_runs_select
on public.database_maintenance_runs
for select
to authenticated
using (
  organization_id is null
  or public.is_organization_member(organization_id)
);

grant select on public.database_maintenance_runs to authenticated;

commit;
