begin;
create table if not exists public.application_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
 level text not null check(level in('debug','info','warning','error','critical')), source text not null, message text not null,
 request_id text, user_id uuid, context jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists application_logs_org_occurred_idx on public.application_logs(organization_id,occurred_at desc);
create index if not exists application_logs_level_occurred_idx on public.application_logs(level,occurred_at desc);
alter table public.application_logs enable row level security;
create policy application_logs_select on public.application_logs for select to authenticated using(organization_id is null or public.is_organization_member(organization_id));
revoke insert,update,delete on public.application_logs from anon,authenticated;
grant select on public.application_logs to authenticated;
commit;
