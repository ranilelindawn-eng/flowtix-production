begin;

create table if not exists public.sales_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  currency_code text not null default 'USD',
  created_deals integer not null default 0,
  open_deals integer not null default 0,
  won_deals integer not null default 0,
  lost_deals integer not null default 0,
  pipeline_value numeric not null default 0,
  weighted_pipeline_value numeric not null default 0,
  won_revenue numeric not null default 0,
  average_deal_size numeric not null default 0,
  win_rate numeric not null default 0,
  average_sales_cycle_days numeric not null default 0,
  stale_deals integer not null default 0,
  overdue_next_steps integer not null default 0,
  stage_metrics jsonb not null default '[]'::jsonb,
  owner_metrics jsonb not null default '[]'::jsonb,
  source_metrics jsonb not null default '[]'::jsonb,
  forecast_metrics jsonb not null default '[]'::jsonb,
  trend_metrics jsonb not null default '[]'::jsonb,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint sales_analytics_snapshots_period_check check (period in ('7d','30d','90d','365d')),
  constraint sales_analytics_snapshots_range_check check (period_end >= period_start),
  constraint sales_analytics_snapshots_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint sales_analytics_snapshots_counts_check check (created_deals >= 0 and open_deals >= 0 and won_deals >= 0 and lost_deals >= 0 and stale_deals >= 0 and overdue_next_steps >= 0),
  constraint sales_analytics_snapshots_values_check check (pipeline_value >= 0 and weighted_pipeline_value >= 0 and won_revenue >= 0 and average_deal_size >= 0 and average_sales_cycle_days >= 0),
  constraint sales_analytics_snapshots_win_rate_check check (win_rate between 0 and 100)
);

create index if not exists sales_analytics_snapshots_org_period_idx
  on public.sales_analytics_snapshots (organization_id, period, captured_at desc);
create index if not exists sales_analytics_snapshots_org_captured_idx
  on public.sales_analytics_snapshots (organization_id, captured_at desc);

alter table public.sales_analytics_snapshots enable row level security;
revoke all on public.sales_analytics_snapshots from anon;
grant select, insert on public.sales_analytics_snapshots to authenticated;

drop policy if exists sales_analytics_snapshots_select on public.sales_analytics_snapshots;
create policy sales_analytics_snapshots_select on public.sales_analytics_snapshots
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists sales_analytics_snapshots_insert on public.sales_analytics_snapshots;
create policy sales_analytics_snapshots_insert on public.sales_analytics_snapshots
for insert to authenticated with check (
  public.is_organization_member(organization_id)
  and (captured_by is null or captured_by = auth.uid())
);

commit;
