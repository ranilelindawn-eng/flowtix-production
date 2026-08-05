begin;

create table if not exists public.call_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_calls integer not null default 0,
  inbound_calls integer not null default 0,
  outbound_calls integer not null default 0,
  connected_calls integer not null default 0,
  failed_calls integer not null default 0,
  missed_calls integer not null default 0,
  connect_rate numeric not null default 0,
  total_talk_seconds bigint not null default 0,
  average_duration_seconds numeric not null default 0,
  average_answer_seconds numeric not null default 0,
  recorded_calls integer not null default 0,
  recording_rate numeric not null default 0,
  queue_entries integer not null default 0,
  queue_answered integer not null default 0,
  queue_abandoned integer not null default 0,
  queue_abandon_rate numeric not null default 0,
  routing_attempts integer not null default 0,
  routing_failures integer not null default 0,
  provider_metrics jsonb not null default '[]'::jsonb,
  direction_metrics jsonb not null default '[]'::jsonb,
  agent_metrics jsonb not null default '[]'::jsonb,
  queue_metrics jsonb not null default '[]'::jsonb,
  routing_metrics jsonb not null default '[]'::jsonb,
  trend_metrics jsonb not null default '[]'::jsonb,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint call_analytics_snapshots_period_check check (period in ('7d','30d','90d','365d')),
  constraint call_analytics_snapshots_range_check check (period_end >= period_start),
  constraint call_analytics_snapshots_counts_check check (
    total_calls >= 0 and inbound_calls >= 0 and outbound_calls >= 0 and connected_calls >= 0
    and failed_calls >= 0 and missed_calls >= 0 and recorded_calls >= 0 and queue_entries >= 0
    and queue_answered >= 0 and queue_abandoned >= 0 and routing_attempts >= 0 and routing_failures >= 0
  ),
  constraint call_analytics_snapshots_durations_check check (
    total_talk_seconds >= 0 and average_duration_seconds >= 0 and average_answer_seconds >= 0
  ),
  constraint call_analytics_snapshots_rates_check check (
    connect_rate between 0 and 100 and recording_rate between 0 and 100 and queue_abandon_rate between 0 and 100
  )
);

create index if not exists call_analytics_snapshots_org_period_idx
  on public.call_analytics_snapshots (organization_id, period, captured_at desc);
create index if not exists call_analytics_snapshots_org_captured_idx
  on public.call_analytics_snapshots (organization_id, captured_at desc);

alter table public.call_analytics_snapshots enable row level security;
revoke all on public.call_analytics_snapshots from anon;
grant select, insert on public.call_analytics_snapshots to authenticated;
grant all on public.call_analytics_snapshots to service_role;

drop policy if exists call_analytics_snapshots_select on public.call_analytics_snapshots;
create policy call_analytics_snapshots_select on public.call_analytics_snapshots
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists call_analytics_snapshots_insert on public.call_analytics_snapshots;
create policy call_analytics_snapshots_insert on public.call_analytics_snapshots
for insert to authenticated with check (
  public.is_organization_member(organization_id)
  and (captured_by is null or captured_by = auth.uid())
);

commit;
