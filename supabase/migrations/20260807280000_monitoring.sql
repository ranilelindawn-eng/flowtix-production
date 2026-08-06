begin;
create table if not exists public.service_monitors (
 id uuid primary key default gen_random_uuid(), service_key text not null unique, display_name text not null,
 status text not null default 'unknown' check(status in('healthy','warning','critical','unknown')),
 last_checked_at timestamptz, latency_ms integer, consecutive_failures integer not null default 0,
 metadata jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.operational_incidents (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
 title text not null, description text, severity text not null check(severity in('low','medium','high','critical')),
 status text not null default 'open' check(status in('open','investigating','monitoring','resolved')),
 source text not null default 'monitoring', started_at timestamptz not null default now(), resolved_at timestamptz,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
insert into public.service_monitors(service_key,display_name) values ('web','Web application'),('database','PostgreSQL database'),('jobs','Background jobs'),('telephony','Telephony providers'),('billing','PayMongo billing') on conflict(service_key) do nothing;
alter table public.service_monitors enable row level security; alter table public.operational_incidents enable row level security;
create policy service_monitors_select on public.service_monitors for select to authenticated using(true);
create policy operational_incidents_select on public.operational_incidents for select to authenticated using(organization_id is null or public.is_organization_member(organization_id));
grant select on public.service_monitors,public.operational_incidents to authenticated;
commit;
