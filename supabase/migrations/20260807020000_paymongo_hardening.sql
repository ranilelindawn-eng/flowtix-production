begin;

alter table public.subscription_plans
  add column if not exists billing_provider text not null default 'paymongo',
  add column if not exists provider_price_code text;

update public.subscription_plans
set billing_provider = 'paymongo',
    provider_price_code = coalesce(provider_price_code, paymongo_price_code, code)
where billing_provider is distinct from 'paymongo'
   or provider_price_code is null;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_billing_provider_check;
alter table public.subscription_plans
  add constraint subscription_plans_billing_provider_check
  check (billing_provider in ('paymongo', 'legacy_stripe'));

alter table public.organization_subscriptions
  add column if not exists billing_provider text not null default 'paymongo',
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_checkout_id text,
  add column if not exists provider_payment_id text,
  add column if not exists last_billing_event_at timestamptz,
  add column if not exists billing_metadata jsonb not null default '{}'::jsonb;

update public.organization_subscriptions
set billing_provider = 'paymongo',
    provider_checkout_id = coalesce(provider_checkout_id, paymongo_checkout_id),
    provider_payment_id = coalesce(provider_payment_id, paymongo_payment_id)
where paymongo_checkout_id is not null
   or paymongo_payment_id is not null
   or billing_provider is null;

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_billing_provider_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_billing_provider_check
  check (billing_provider in ('paymongo', 'legacy_stripe'));

create index if not exists organization_subscriptions_provider_checkout_idx
  on public.organization_subscriptions (billing_provider, provider_checkout_id)
  where provider_checkout_id is not null;

create index if not exists organization_subscriptions_provider_payment_idx
  on public.organization_subscriptions (billing_provider, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists public.billing_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  livemode boolean,
  signature_timestamp timestamptz,
  provider_resource_type text,
  provider_resource_id text,
  checkout_id text,
  payment_id text,
  plan_code text,
  status text not null default 'received',
  processing_attempts integer not null default 1,
  ignored_reason text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint billing_payment_events_provider_check
    check (provider in ('paymongo', 'legacy_stripe')),
  constraint billing_payment_events_status_check
    check (status in ('received', 'processed', 'ignored', 'failed')),
  constraint billing_payment_events_provider_event_unique
    unique (provider, provider_event_id)
);

create index if not exists billing_payment_events_org_received_idx
  on public.billing_payment_events (organization_id, received_at desc);
create index if not exists billing_payment_events_status_idx
  on public.billing_payment_events (provider, status, received_at desc);
create index if not exists billing_payment_events_checkout_idx
  on public.billing_payment_events (checkout_id)
  where checkout_id is not null;

alter table public.billing_payment_events enable row level security;

revoke all on public.billing_payment_events from anon;
revoke insert, update, delete on public.billing_payment_events from authenticated;
grant select on public.billing_payment_events to authenticated;

create policy billing_payment_events_select_members
on public.billing_payment_events
for select
to authenticated
using (
  organization_id is not null
  and exists (
    select 1
    from public.organization_members member
    where member.organization_id = billing_payment_events.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

comment on column public.subscription_plans.stripe_price_id is
  'Deprecated historical Stripe identifier. Flowtix active billing uses PayMongo. Do not use for new transactions.';
comment on column public.organization_subscriptions.stripe_customer_id is
  'Deprecated historical Stripe identifier retained for non-destructive migration history.';
comment on column public.organization_subscriptions.stripe_subscription_id is
  'Deprecated historical Stripe identifier retained for non-destructive migration history.';
comment on table public.subscription_events is
  'Legacy Stripe event history. New billing events are stored in billing_payment_events.';

create or replace function public.process_paymongo_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_signature_timestamp timestamptz,
  p_resource_type text,
  p_resource_id text,
  p_organization_id uuid,
  p_checkout_id text,
  p_payment_id text,
  p_plan_code text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.billing_payment_events%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  target_plan public.subscription_plans%rowtype;
  result_status text;
begin
  if nullif(trim(p_event_id), '') is null then
    raise exception 'PayMongo event ID is required.';
  end if;

  insert into public.billing_payment_events (
    provider,
    provider_event_id,
    event_type,
    livemode,
    signature_timestamp,
    provider_resource_type,
    provider_resource_id,
    organization_id,
    checkout_id,
    payment_id,
    plan_code,
    payload,
    status
  )
  values (
    'paymongo',
    p_event_id,
    coalesce(nullif(trim(p_event_type), ''), 'unknown'),
    p_livemode,
    p_signature_timestamp,
    nullif(trim(p_resource_type), ''),
    nullif(trim(p_resource_id), ''),
    p_organization_id,
    nullif(trim(p_checkout_id), ''),
    nullif(trim(p_payment_id), ''),
    nullif(trim(p_plan_code), ''),
    coalesce(p_payload, '{}'::jsonb),
    'received'
  )
  on conflict (provider, provider_event_id)
  do update set
    processing_attempts = public.billing_payment_events.processing_attempts + 1,
    updated_at = now()
  returning * into event_row;

  if event_row.status in ('processed', 'ignored') then
    return jsonb_build_object(
      'status', event_row.status,
      'duplicate', true,
      'reason', event_row.ignored_reason
    );
  end if;

  begin
  if p_event_type <> 'checkout_session.payment.paid' then
    update public.billing_payment_events
    set status = 'ignored',
        ignored_reason = 'unsupported_event_type',
        processed_at = now(),
        updated_at = now()
    where id = event_row.id;

    return jsonb_build_object(
      'status', 'ignored',
      'duplicate', false,
      'reason', 'unsupported_event_type'
    );
  end if;

  if p_organization_id is null
     or nullif(trim(p_checkout_id), '') is null
     or nullif(trim(p_plan_code), '') is null then
    update public.billing_payment_events
    set status = 'ignored',
        ignored_reason = 'incomplete_metadata',
        processed_at = now(),
        updated_at = now()
    where id = event_row.id;

    return jsonb_build_object('status', 'ignored', 'reason', 'incomplete_metadata');
  end if;

  if nullif(trim(p_payment_id), '') is not null and exists (
    select 1
    from public.billing_payment_events previous_event
    where previous_event.provider = 'paymongo'
      and previous_event.payment_id = p_payment_id
      and previous_event.status = 'processed'
      and previous_event.provider_event_id <> p_event_id
  ) then
    update public.billing_payment_events
    set status = 'ignored',
        ignored_reason = 'duplicate_payment',
        processed_at = now(),
        updated_at = now()
    where id = event_row.id;

    return jsonb_build_object('status', 'ignored', 'reason', 'duplicate_payment');
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    update public.billing_payment_events
    set status = 'ignored',
        ignored_reason = 'subscription_not_found',
        processed_at = now(),
        updated_at = now()
    where id = event_row.id;

    return jsonb_build_object('status', 'ignored', 'reason', 'subscription_not_found');
  end if;

  if subscription_row.paymongo_checkout_id is not null
     and subscription_row.paymongo_checkout_id <> p_checkout_id then
    update public.billing_payment_events
    set status = 'ignored',
        ignored_reason = 'stale_checkout',
        processed_at = now(),
        updated_at = now()
    where id = event_row.id;

    return jsonb_build_object('status', 'ignored', 'reason', 'stale_checkout');
  end if;

  select * into target_plan
  from public.subscription_plans
  where code = p_plan_code
    and is_active = true
  limit 1;

  if not found then
    update public.billing_payment_events
    set status = 'ignored',
        ignored_reason = 'plan_not_found',
        processed_at = now(),
        updated_at = now()
    where id = event_row.id;

    return jsonb_build_object('status', 'ignored', 'reason', 'plan_not_found');
  end if;

  update public.organization_subscriptions
  set plan_id = target_plan.id,
      status = 'active',
      billing_provider = 'paymongo',
      paymongo_checkout_id = p_checkout_id,
      paymongo_plan_code = p_plan_code,
      paymongo_payment_id = nullif(trim(p_payment_id), ''),
      provider_checkout_id = p_checkout_id,
      provider_payment_id = nullif(trim(p_payment_id), ''),
      last_billing_event_at = now(),
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
        'last_event_id', p_event_id,
        'last_event_type', p_event_type,
        'livemode', p_livemode
      ),
      updated_at = now()
  where id = subscription_row.id;

  update public.billing_payment_events
  set organization_id = p_organization_id,
      status = 'processed',
      processed_at = now(),
      updated_at = now()
  where id = event_row.id;

  return jsonb_build_object(
    'status', 'processed',
    'duplicate', false,
    'organization_id', p_organization_id,
    'subscription_id', subscription_row.id,
    'plan_id', target_plan.id
  );
exception
  when others then
    update public.billing_payment_events
    set status = 'failed',
        error_message = left(sqlerrm, 2000),
        updated_at = now()
    where provider = 'paymongo'
      and provider_event_id = p_event_id;

    return jsonb_build_object(
      'status', 'failed',
      'reason', 'processing_error',
      'error', left(sqlerrm, 2000)
    );
  end;
end;
$$;

revoke all on function public.process_paymongo_webhook_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_paymongo_webhook_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text, jsonb
) to service_role;

commit;
