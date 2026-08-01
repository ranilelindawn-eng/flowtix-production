-- Flowtix billing provider compatibility
-- Adds provider-neutral billing identifiers while preserving all existing Stripe columns.
-- Stripe continues to work unchanged during the PayMongo test migration.

begin;

alter table public.organization_subscriptions
  add column if not exists billing_provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;

comment on column public.organization_subscriptions.billing_provider is
  'Payment provider currently responsible for this subscription, such as stripe or paymongo.';

comment on column public.organization_subscriptions.provider_customer_id is
  'Provider-neutral customer identifier. Existing Stripe identifiers remain in stripe_customer_id during migration.';

comment on column public.organization_subscriptions.provider_subscription_id is
  'Provider-neutral subscription, checkout, or recurring billing identifier. Existing Stripe identifiers remain in stripe_subscription_id during migration.';

update public.organization_subscriptions
set
  billing_provider = coalesce(billing_provider, 'stripe'),
  provider_customer_id = coalesce(provider_customer_id, stripe_customer_id),
  provider_subscription_id = coalesce(
    provider_subscription_id,
    stripe_subscription_id
  )
where stripe_customer_id is not null
   or stripe_subscription_id is not null;

create unique index if not exists organization_subscriptions_provider_subscription_uidx
  on public.organization_subscriptions (
    billing_provider,
    provider_subscription_id
  )
  where billing_provider is not null
    and provider_subscription_id is not null;

create index if not exists organization_subscriptions_provider_customer_idx
  on public.organization_subscriptions (
    billing_provider,
    provider_customer_id
  )
  where billing_provider is not null
    and provider_customer_id is not null;

alter table public.subscription_events
  add column if not exists billing_provider text,
  add column if not exists provider_event_id text,
  add column if not exists provider_subscription_id text;

comment on column public.subscription_events.billing_provider is
  'Payment provider that emitted this webhook event.';

comment on column public.subscription_events.provider_event_id is
  'Provider-neutral webhook event identifier used for idempotent processing.';

comment on column public.subscription_events.provider_subscription_id is
  'Provider-neutral subscription or checkout identifier associated with the event.';

update public.subscription_events
set
  billing_provider = coalesce(billing_provider, 'stripe'),
  provider_event_id = coalesce(provider_event_id, stripe_event_id),
  provider_subscription_id = coalesce(
    provider_subscription_id,
    stripe_subscription_id
  )
where stripe_event_id is not null
   or stripe_subscription_id is not null;

create unique index if not exists subscription_events_provider_event_uidx
  on public.subscription_events (
    billing_provider,
    provider_event_id
  )
  where billing_provider is not null
    and provider_event_id is not null;

create index if not exists subscription_events_provider_subscription_idx
  on public.subscription_events (
    billing_provider,
    provider_subscription_id
  )
  where billing_provider is not null
    and provider_subscription_id is not null;

commit;
