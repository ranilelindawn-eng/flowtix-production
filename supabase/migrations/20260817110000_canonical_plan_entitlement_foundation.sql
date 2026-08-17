begin;

-- -------------------------------------------------------------------
-- Flowtix Phase 1 — Canonical plan & entitlement foundation
--
-- This migration aligns the persisted plan records with the approved
-- Starter / Professional / Business / Enterprise entitlement matrix.
-- Existing organization_subscriptions keep their current plan_id values;
-- updating the plan rows in place means active/trial subscriptions inherit
-- the new limits and entitlements without destructive subscription rewrites.
--
-- IMPORTANT: monthly_price_cents remains the existing PayMongo PHP checkout
-- amount. public_price_usd_cents stores the approved public USD list price for
-- the later Pricing/Billing UI phase and MUST NOT be used by the current
-- PayMongo checkout flow, which is explicitly PHP-based.
-- -------------------------------------------------------------------

alter table public.subscription_plans
  add column if not exists public_price_usd_cents integer,
  add column if not exists max_active_campaigns integer,
  add column if not exists max_active_sequences integer,
  add column if not exists recording_retention_days integer,
  add column if not exists max_transcription_minutes_per_month integer;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_public_price_usd_nonnegative,
  drop constraint if exists subscription_plans_active_campaigns_nonnegative,
  drop constraint if exists subscription_plans_active_sequences_nonnegative,
  drop constraint if exists subscription_plans_recording_retention_nonnegative,
  drop constraint if exists subscription_plans_transcription_minutes_nonnegative;

alter table public.subscription_plans
  add constraint subscription_plans_public_price_usd_nonnegative
    check (public_price_usd_cents is null or public_price_usd_cents >= 0),
  add constraint subscription_plans_active_campaigns_nonnegative
    check (max_active_campaigns is null or max_active_campaigns >= 0),
  add constraint subscription_plans_active_sequences_nonnegative
    check (max_active_sequences is null or max_active_sequences >= 0),
  add constraint subscription_plans_recording_retention_nonnegative
    check (recording_retention_days is null or recording_retention_days >= 0),
  add constraint subscription_plans_transcription_minutes_nonnegative
    check (
      max_transcription_minutes_per_month is null
      or max_transcription_minutes_per_month >= 0
    );

update public.subscription_plans
set
  name = case code
    when 'starter' then 'Starter'
    when 'pro' then 'Professional'
    when 'business' then 'Business'
    when 'enterprise' then 'Enterprise'
    else name
  end,
  public_price_usd_cents = case code
    when 'starter' then 4900
    when 'pro' then 9900
    when 'business' then 19900
    when 'enterprise' then 39900
    else public_price_usd_cents
  end,
  max_members = case code
    when 'starter' then 2
    when 'pro' then 5
    when 'business' then 15
    when 'enterprise' then null
    else max_members
  end,
  max_contacts = case code
    when 'starter' then 2500
    when 'pro' then 10000
    when 'business' then 50000
    when 'enterprise' then null
    else max_contacts
  end,
  max_storage_bytes = case code
    when 'starter' then 2147483648::bigint
    when 'pro' then 10737418240::bigint
    when 'business' then 53687091200::bigint
    when 'enterprise' then null
    else max_storage_bytes
  end,
  max_ai_requests_per_month = case code
    when 'starter' then 100
    when 'pro' then 1000
    when 'business' then 5000
    when 'enterprise' then null
    else max_ai_requests_per_month
  end,
  max_active_campaigns = case code
    when 'starter' then 1
    when 'pro' then 10
    when 'business' then 50
    when 'enterprise' then null
    else max_active_campaigns
  end,
  max_active_sequences = case code
    when 'starter' then 2
    when 'pro' then 20
    when 'business' then 100
    when 'enterprise' then null
    else max_active_sequences
  end,
  recording_retention_days = case code
    when 'starter' then 30
    when 'pro' then 90
    when 'business' then 365
    when 'enterprise' then null
    else recording_retention_days
  end,
  max_transcription_minutes_per_month = case code
    when 'starter' then 0
    when 'pro' then 500
    when 'business' then 2500
    when 'enterprise' then null
    else max_transcription_minutes_per_month
  end,
  entitlements = case code
    when 'starter' then '[
      "crm.core",
      "calendar.core",
      "communications.manual",
      "campaigns.basic",
      "reports.basic",
      "reports.export",
      "dialer.cloud",
      "ai.limited",
      "automation.sequences",
      "integrations.google"
    ]'::jsonb
    when 'pro' then '[
      "crm.core",
      "calendar.core",
      "communications.manual",
      "campaigns.basic",
      "reports.basic",
      "reports.export",
      "dialer.cloud",
      "ai.limited",
      "ai.email",
      "ai.tasks",
      "automation.sequences",
      "integrations.google",
      "reports.advanced",
      "ai.chat",
      "ai.call_analysis",
      "ai.transcription",
      "ai.insights",
      "automation.campaigns",
      "integrations.premium",
      "analytics.dashboards",
      "analytics.kpi",
      "analytics.sales",
      "analytics.calls"
    ]'::jsonb
    when 'business' then '[
      "crm.core",
      "calendar.core",
      "communications.manual",
      "campaigns.basic",
      "reports.basic",
      "reports.export",
      "dialer.cloud",
      "ai.limited",
      "ai.email",
      "ai.tasks",
      "automation.sequences",
      "integrations.google",
      "reports.advanced",
      "ai.chat",
      "ai.call_analysis",
      "ai.transcription",
      "ai.insights",
      "automation.campaigns",
      "integrations.premium",
      "analytics.dashboards",
      "analytics.kpi",
      "analytics.sales",
      "analytics.calls",
      "ai.advanced",
      "automation.advanced",
      "api.access",
      "team.advanced",
      "security.advanced",
      "analytics.agents",
      "analytics.campaigns",
      "analytics.ai",
      "workforce.attendance"
    ]'::jsonb
    when 'enterprise' then '[
      "crm.core",
      "calendar.core",
      "communications.manual",
      "campaigns.basic",
      "reports.basic",
      "reports.export",
      "dialer.cloud",
      "ai.limited",
      "ai.email",
      "ai.tasks",
      "automation.sequences",
      "integrations.google",
      "reports.advanced",
      "ai.chat",
      "ai.call_analysis",
      "ai.transcription",
      "ai.insights",
      "automation.campaigns",
      "integrations.premium",
      "analytics.dashboards",
      "analytics.kpi",
      "analytics.sales",
      "analytics.calls",
      "ai.advanced",
      "automation.advanced",
      "api.access",
      "team.advanced",
      "security.advanced",
      "analytics.agents",
      "analytics.campaigns",
      "analytics.ai",
      "workforce.attendance"
    ]'::jsonb
    else entitlements
  end,
  sort_order = case code
    when 'starter' then 10
    when 'pro' then 20
    when 'business' then 30
    when 'enterprise' then 40
    else sort_order
  end,
  is_public = case
    when code in ('starter', 'pro', 'business', 'enterprise') then true
    else is_public
  end,
  updated_at = now()
where code in ('starter', 'pro', 'business', 'enterprise');

comment on column public.subscription_plans.public_price_usd_cents is
  'Approved public Flowtix list price in USD cents. Current PayMongo checkout remains PHP-based and continues using monthly_price_cents until the later billing/pricing phase.';
comment on column public.subscription_plans.max_active_campaigns is
  'Maximum concurrently active campaigns for the plan. NULL means organization-specific/custom policy.';
comment on column public.subscription_plans.max_active_sequences is
  'Maximum concurrently active sequences for the plan. NULL means organization-specific/custom policy.';
comment on column public.subscription_plans.recording_retention_days is
  'Plan recording-retention policy in days. NULL means organization-specific/custom policy.';
comment on column public.subscription_plans.max_transcription_minutes_per_month is
  'Monthly transcription-minute allowance. NULL means organization-specific/custom policy.';

commit;

notify pgrst, 'reload schema';
