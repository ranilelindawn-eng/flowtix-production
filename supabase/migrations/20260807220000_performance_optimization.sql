begin;
create table if not exists public.performance_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 route_group text not null default 'application', p50_ms integer not null default 0, p95_ms integer not null default 0,
 request_count bigint not null default 0, error_count bigint not null default 0, metadata jsonb not null default '{}'::jsonb,
 captured_at timestamptz not null default now()
);
create index if not exists performance_snapshots_org_captured_idx on public.performance_snapshots(organization_id,captured_at desc);
alter table public.performance_snapshots enable row level security;
drop policy if exists performance_snapshots_select on public.performance_snapshots;
create policy performance_snapshots_select on public.performance_snapshots for select to authenticated using(public.is_organization_member(organization_id));
revoke all on public.performance_snapshots from anon;
grant select on public.performance_snapshots to authenticated;
commit;
