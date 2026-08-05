begin;

create table if not exists public.agent_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period text not null check (period in ('7d','30d','90d','365d')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_agents integer not null default 0 check (total_agents >= 0),
  available_agents integer not null default 0 check (available_agents >= 0),
  busy_agents integer not null default 0 check (busy_agents >= 0),
  away_agents integer not null default 0 check (away_agents >= 0),
  offline_agents integer not null default 0 check (offline_agents >= 0),
  total_calls integer not null default 0 check (total_calls >= 0),
  connected_calls integer not null default 0 check (connected_calls >= 0),
  connect_rate numeric(7,4) not null default 0 check (connect_rate between 0 and 100),
  total_talk_seconds bigint not null default 0 check (total_talk_seconds >= 0),
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  overdue_tasks integer not null default 0 check (overdue_tasks >= 0),
  completed_activities integer not null default 0 check (completed_activities >= 0),
  attendance_seconds bigint not null default 0 check (attendance_seconds >= 0),
  average_coaching_score numeric(7,4) check (average_coaching_score is null or average_coaching_score between 0 and 100),
  average_productivity_score numeric(7,4) not null default 0 check (average_productivity_score between 0 and 100),
  agent_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(agent_metrics) = 'array'),
  trend_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(trend_metrics) = 'array'),
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (period_end >= period_start)
);

create index if not exists agent_analytics_snapshots_org_period_idx
  on public.agent_analytics_snapshots (organization_id, period, captured_at desc);
create index if not exists agent_analytics_snapshots_org_captured_idx
  on public.agent_analytics_snapshots (organization_id, captured_at desc);

alter table public.agent_analytics_snapshots enable row level security;
revoke all on public.agent_analytics_snapshots from anon;
grant select, insert on public.agent_analytics_snapshots to authenticated;

drop policy if exists agent_analytics_snapshots_select on public.agent_analytics_snapshots;
create policy agent_analytics_snapshots_select
on public.agent_analytics_snapshots for select to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = agent_analytics_snapshots.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

drop policy if exists agent_analytics_snapshots_insert on public.agent_analytics_snapshots;
create policy agent_analytics_snapshots_insert
on public.agent_analytics_snapshots for insert to authenticated
with check (
  (captured_by is null or captured_by = auth.uid())
  and exists (
    select 1 from public.organization_members member
    where member.organization_id = agent_analytics_snapshots.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

comment on table public.agent_analytics_snapshots is 'Durable tenant-scoped workforce analytics snapshots for Flowtix Phase 6.4.';

commit;
