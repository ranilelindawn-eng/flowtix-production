begin;

-- Provider-neutral billing columns must exist before legacy Stripe columns are removed.
alter table public.organization_subscriptions
  add column if not exists billing_provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;

alter table public.subscription_events
  add column if not exists billing_provider text,
  add column if not exists provider_event_id text,
  add column if not exists provider_subscription_id text;

-- Preserve any historical identifiers before removing legacy columns.
update public.organization_subscriptions
set
  billing_provider = coalesce(billing_provider, 'stripe'),
  provider_customer_id = coalesce(provider_customer_id, stripe_customer_id),
  provider_subscription_id = coalesce(provider_subscription_id, stripe_subscription_id)
where stripe_customer_id is not null
   or stripe_subscription_id is not null;

update public.subscription_events
set
  billing_provider = coalesce(billing_provider, 'stripe'),
  provider_event_id = coalesce(provider_event_id, stripe_event_id),
  provider_subscription_id = coalesce(provider_subscription_id, stripe_subscription_id)
where stripe_event_id is not null
   or stripe_subscription_id is not null;

create unique index if not exists organization_subscriptions_provider_subscription_uidx
  on public.organization_subscriptions (billing_provider, provider_subscription_id)
  where billing_provider is not null and provider_subscription_id is not null;

create unique index if not exists subscription_events_provider_event_uidx
  on public.subscription_events (billing_provider, provider_event_id)
  where billing_provider is not null and provider_event_id is not null;

create index if not exists subscription_events_provider_subscription_idx
  on public.subscription_events (billing_provider, provider_subscription_id)
  where billing_provider is not null and provider_subscription_id is not null;

alter table public.organization_subscriptions
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

alter table public.subscription_events
  drop column if exists stripe_event_id,
  drop column if exists stripe_subscription_id;

alter table public.subscription_plans
  drop column if exists stripe_price_id;

-- Store PayMongo amounts in Philippine centavos.
update public.subscription_plans
set monthly_price_cents = case code
  when 'starter' then 169900
  when 'pro' then 459900
  when 'business' then 1159900
  when 'enterprise' then 2899900
  else monthly_price_cents
end,
updated_at = now()
where code in ('starter', 'pro', 'business', 'enterprise');

comment on column public.subscription_plans.monthly_price_cents is
  'Monthly plan amount in Philippine centavos for PayMongo checkout.';

commit;
