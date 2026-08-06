begin;
create table if not exists public.disaster_recovery_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
 backup_type text not null check(backup_type in('database','storage','configuration','full','restore_drill')),
 status text not null default 'scheduled' check(status in('scheduled','running','completed','failed','verified')),
 recovery_point_at timestamptz, checksum text, storage_location text, retention_until timestamptz,
 verified_at timestamptz, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists disaster_recovery_records_org_created_idx on public.disaster_recovery_records(organization_id,created_at desc);
alter table public.disaster_recovery_records enable row level security;
create policy disaster_recovery_records_select on public.disaster_recovery_records for select to authenticated using(organization_id is null or public.is_organization_member(organization_id));
grant select on public.disaster_recovery_records to authenticated;
commit;
