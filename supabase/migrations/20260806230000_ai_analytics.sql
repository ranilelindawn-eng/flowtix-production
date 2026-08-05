begin;
create table if not exists public.ai_analytics_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 period text not null check(period in ('7d','30d','90d','365d')), period_start timestamptz not null, period_end timestamptz not null,
 total_requests bigint not null default 0, completed_requests bigint not null default 0, failed_requests bigint not null default 0, cancelled_requests bigint not null default 0,
 input_tokens bigint not null default 0, output_tokens bigint not null default 0, total_tokens bigint not null default 0, cost_micros bigint not null default 0,
 average_latency_ms numeric(14,2) not null default 0, success_rate numeric(8,4) not null default 0,
 conversations bigint not null default 0, assistant_messages bigint not null default 0, summaries bigint not null default 0, sentiment_analyses bigint not null default 0,
 coaching_analyses bigint not null default 0, transcript_runs bigint not null default 0,
 feature_metrics jsonb not null default '[]'::jsonb, prompt_metrics jsonb not null default '[]'::jsonb, model_metrics jsonb not null default '[]'::jsonb,
 provider_metrics jsonb not null default '[]'::jsonb, trend_metrics jsonb not null default '[]'::jsonb, metadata jsonb not null default '{}'::jsonb,
 captured_by uuid not null default auth.uid() references auth.users(id) on delete restrict, captured_at timestamptz not null default now(),
 check(period_end>=period_start), check(input_tokens>=0 and output_tokens>=0 and total_tokens>=0 and cost_micros>=0), check(average_latency_ms>=0), check(success_rate between 0 and 100),
 check(jsonb_typeof(feature_metrics)='array' and jsonb_typeof(prompt_metrics)='array' and jsonb_typeof(model_metrics)='array' and jsonb_typeof(provider_metrics)='array' and jsonb_typeof(trend_metrics)='array' and jsonb_typeof(metadata)='object')
);
create index if not exists ai_analytics_snapshots_org_period_idx on public.ai_analytics_snapshots(organization_id,period,captured_at desc);
alter table public.ai_analytics_snapshots enable row level security;
drop policy if exists ai_analytics_snapshots_select_member on public.ai_analytics_snapshots;
create policy ai_analytics_snapshots_select_member on public.ai_analytics_snapshots for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists ai_analytics_snapshots_insert_member on public.ai_analytics_snapshots;
create policy ai_analytics_snapshots_insert_member on public.ai_analytics_snapshots for insert to authenticated with check(captured_by=auth.uid() and public.is_organization_member(organization_id));
revoke all on public.ai_analytics_snapshots from anon; grant select,insert on public.ai_analytics_snapshots to authenticated;
commit;
