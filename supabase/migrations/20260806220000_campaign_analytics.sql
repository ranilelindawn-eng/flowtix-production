begin;

create table if not exists public.campaign_engagement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  communication_message_id uuid references public.communication_messages(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  event_type text not null check (event_type in ('email_open','email_click','email_reply','email_bounce','sms_reply','conversion')),
  provider text,
  provider_event_id text,
  event_at timestamptz not null default now(),
  value numeric(18,4) not null default 0 check (value >= 0),
  cost numeric(18,4) not null default 0 check (cost >= 0),
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index if not exists campaign_engagement_events_provider_unique_idx
  on public.campaign_engagement_events (organization_id, provider, provider_event_id)
  where provider is not null and provider_event_id is not null;
create index if not exists campaign_engagement_events_campaign_time_idx
  on public.campaign_engagement_events (organization_id, campaign_id, event_at desc);
create index if not exists campaign_engagement_events_message_idx
  on public.campaign_engagement_events (communication_message_id, event_at desc)
  where communication_message_id is not null;

alter table public.campaign_engagement_events enable row level security;
revoke all on public.campaign_engagement_events from anon;
grant select, insert on public.campaign_engagement_events to authenticated;
grant all on public.campaign_engagement_events to service_role;

drop policy if exists campaign_engagement_events_select on public.campaign_engagement_events;
create policy campaign_engagement_events_select
on public.campaign_engagement_events for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists campaign_engagement_events_insert on public.campaign_engagement_events;
create policy campaign_engagement_events_insert
on public.campaign_engagement_events for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_engagement_events.campaign_id
      and campaign.organization_id = campaign_engagement_events.organization_id
  )
);

create table if not exists public.campaign_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period text not null check (period in ('7d','30d','90d','365d')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_campaigns integer not null default 0 check (total_campaigns >= 0),
  active_campaigns integer not null default 0 check (active_campaigns >= 0),
  enrollments integer not null default 0 check (enrollments >= 0),
  completed_enrollments integer not null default 0 check (completed_enrollments >= 0),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  delivered integer not null default 0 check (delivered >= 0),
  failed integer not null default 0 check (failed >= 0),
  email_sent integer not null default 0 check (email_sent >= 0),
  email_opened integer not null default 0 check (email_opened >= 0),
  email_clicked integer not null default 0 check (email_clicked >= 0),
  email_replied integer not null default 0 check (email_replied >= 0),
  email_bounced integer not null default 0 check (email_bounced >= 0),
  sms_sent integer not null default 0 check (sms_sent >= 0),
  sms_delivered integer not null default 0 check (sms_delivered >= 0),
  sms_replied integer not null default 0 check (sms_replied >= 0),
  calls integer not null default 0 check (calls >= 0),
  connected_calls integer not null default 0 check (connected_calls >= 0),
  conversions integer not null default 0 check (conversions >= 0),
  revenue numeric(18,4) not null default 0 check (revenue >= 0),
  cost numeric(18,4) not null default 0 check (cost >= 0),
  delivery_rate numeric(9,4) not null default 0,
  open_rate numeric(9,4) not null default 0,
  click_rate numeric(9,4) not null default 0,
  reply_rate numeric(9,4) not null default 0,
  bounce_rate numeric(9,4) not null default 0,
  sms_delivery_rate numeric(9,4) not null default 0,
  sms_reply_rate numeric(9,4) not null default 0,
  call_connect_rate numeric(9,4) not null default 0,
  conversion_rate numeric(9,4) not null default 0,
  roi numeric(18,4) not null default 0,
  campaign_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(campaign_metrics) = 'array'),
  funnel_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(funnel_metrics) = 'array'),
  trend_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(trend_metrics) = 'array'),
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (period_end >= period_start)
);

create index if not exists campaign_analytics_snapshots_org_period_idx
  on public.campaign_analytics_snapshots (organization_id, period, captured_at desc);
create index if not exists campaign_analytics_snapshots_org_captured_idx
  on public.campaign_analytics_snapshots (organization_id, captured_at desc);

alter table public.campaign_analytics_snapshots enable row level security;
revoke all on public.campaign_analytics_snapshots from anon;
grant select, insert on public.campaign_analytics_snapshots to authenticated;
grant all on public.campaign_analytics_snapshots to service_role;

drop policy if exists campaign_analytics_snapshots_select on public.campaign_analytics_snapshots;
create policy campaign_analytics_snapshots_select
on public.campaign_analytics_snapshots for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists campaign_analytics_snapshots_insert on public.campaign_analytics_snapshots;
create policy campaign_analytics_snapshots_insert
on public.campaign_analytics_snapshots for insert to authenticated
with check (
  (captured_by is null or captured_by = auth.uid())
  and public.is_org_member(organization_id)
);

comment on table public.campaign_engagement_events is 'Provider-neutral campaign engagement and conversion events for Flowtix Phase 6.5.';
comment on table public.campaign_analytics_snapshots is 'Durable tenant-scoped campaign analytics snapshots for Flowtix Phase 6.5.';

commit;
