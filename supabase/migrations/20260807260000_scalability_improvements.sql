begin;
create table if not exists public.capacity_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
 active_users integer not null default 0, database_bytes bigint not null default 0, storage_bytes bigint not null default 0,
 queued_jobs integer not null default 0, concurrent_calls integer not null default 0, utilization_percent numeric(5,2) not null default 0,
 recommendations jsonb not null default '[]'::jsonb, captured_at timestamptz not null default now()
);
create index if not exists capacity_snapshots_org_captured_idx on public.capacity_snapshots(organization_id,captured_at desc);
alter table public.capacity_snapshots enable row level security;
create policy capacity_snapshots_select on public.capacity_snapshots for select to authenticated using(organization_id is null or public.is_organization_member(organization_id));
grant select on public.capacity_snapshots to authenticated;
commit;
