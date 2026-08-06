begin;
create table if not exists public.api_endpoint_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
 method text not null, path_pattern text not null, request_count bigint not null default 0, error_count bigint not null default 0,
 p50_ms integer not null default 0, p95_ms integer not null default 0, p99_ms integer not null default 0,
 window_started_at timestamptz not null, window_ended_at timestamptz not null, captured_at timestamptz not null default now()
);
create unique index if not exists api_endpoint_snapshots_window_uidx on public.api_endpoint_snapshots(coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),method,path_pattern,window_started_at);
alter table public.api_endpoint_snapshots enable row level security;
create policy api_endpoint_snapshots_select on public.api_endpoint_snapshots for select to authenticated using(organization_id is null or public.is_organization_member(organization_id));
grant select on public.api_endpoint_snapshots to authenticated;
commit;
