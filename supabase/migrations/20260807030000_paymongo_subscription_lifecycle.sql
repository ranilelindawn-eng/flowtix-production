begin;

alter table public.organization_subscriptions
  add column if not exists pending_plan_id uuid references public.subscription_plans(id) on delete set null,
  add column if not exists pending_checkout_expires_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists grace_period_ends_at timestamptz,
  add column if not exists payment_failure_count integer not null default 0,
  add column if not exists last_payment_status text;

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_last_payment_status_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_last_payment_status_check
  check (
    last_payment_status is null
    or last_payment_status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled', 'expired')
  );

create index if not exists organization_subscriptions_pending_checkout_expiry_idx
  on public.organization_subscriptions (pending_checkout_expires_at)
  where pending_checkout_expires_at is not null;

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  provider text not null default 'paymongo',
  provider_payment_id text,
  provider_checkout_id text,
  provider_event_id text,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  plan_code text,
  status text not null default 'pending',
  amount integer,
  currency text not null default 'PHP',
  failure_code text,
  failure_message text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint billing_payments_provider_check
    check (provider in ('paymongo', 'legacy_stripe')),
  constraint billing_payments_status_check
    check (status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled', 'expired')),
  constraint billing_payments_currency_check
    check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists billing_payments_provider_payment_unique
  on public.billing_payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create index if not exists billing_payments_org_created_idx
  on public.billing_payments (organization_id, created_at desc);
create index if not exists billing_payments_checkout_idx
  on public.billing_payments (provider_checkout_id)
  where provider_checkout_id is not null;

create table if not exists public.subscription_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete cascade,
  event_type text not null,
  source text not null,
  previous_status text,
  new_status text,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  provider_event_id text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_lifecycle_events_source_check
    check (source in ('paymongo_webhook', 'user', 'system', 'migration'))
);

create index if not exists subscription_lifecycle_events_org_created_idx
  on public.subscription_lifecycle_events (organization_id, created_at desc);
create index if not exists subscription_lifecycle_events_subscription_idx
  on public.subscription_lifecycle_events (subscription_id, created_at desc);
create unique index if not exists subscription_lifecycle_events_provider_event_unique
  on public.subscription_lifecycle_events (provider_event_id, event_type)
  where provider_event_id is not null;

alter table public.billing_payments enable row level security;
alter table public.subscription_lifecycle_events enable row level security;

revoke all on public.billing_payments from anon;
revoke all on public.subscription_lifecycle_events from anon;
revoke insert, update, delete on public.billing_payments from authenticated;
revoke insert, update, delete on public.subscription_lifecycle_events from authenticated;
grant select on public.billing_payments to authenticated;
grant select on public.subscription_lifecycle_events to authenticated;

create policy billing_payments_select_members
on public.billing_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = billing_payments.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

create policy subscription_lifecycle_events_select_members
on public.subscription_lifecycle_events
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = subscription_lifecycle_events.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

create or replace function public.request_subscription_cancellation(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.organization_subscriptions%rowtype;
  actor_role text;
begin
  select member.role into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id
    and coalesce(member.status, 'active') = 'active'
  limit 1;

  if actor_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can cancel the subscription.';
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if subscription_row.status not in ('active', 'trialing', 'past_due') then
    raise exception 'Subscription cannot be cancelled from its current state.';
  end if;

  update public.organization_subscriptions
  set cancel_at_period_end = true,
      updated_at = now(),
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_requested_at', now(),
        'cancellation_requested_by', p_actor_user_id
      )
  where id = subscription_row.id;

  insert into public.subscription_lifecycle_events (
    organization_id,
    subscription_id,
    event_type,
    source,
    previous_status,
    new_status,
    plan_id,
    actor_user_id
  ) values (
    p_organization_id,
    subscription_row.id,
    'cancellation_scheduled',
    'user',
    subscription_row.status,
    subscription_row.status,
    subscription_row.plan_id,
    p_actor_user_id
  );

  return jsonb_build_object(
    'status', subscription_row.status,
    'cancel_at_period_end', true,
    'current_period_end', subscription_row.current_period_end
  );
end;
$$;

create or replace function public.reactivate_subscription(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.organization_subscriptions%rowtype;
  actor_role text;
begin
  select member.role into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id
    and coalesce(member.status, 'active') = 'active'
  limit 1;

  if actor_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can reactivate the subscription.';
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if not subscription_row.cancel_at_period_end then
    return jsonb_build_object(
      'status', subscription_row.status,
      'cancel_at_period_end', false,
      'unchanged', true
    );
  end if;

  update public.organization_subscriptions
  set cancel_at_period_end = false,
      cancelled_at = null,
      updated_at = now(),
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb) - 'cancellation_requested_at' - 'cancellation_requested_by'
  where id = subscription_row.id;

  insert into public.subscription_lifecycle_events (
    organization_id,
    subscription_id,
    event_type,
    source,
    previous_status,
    new_status,
    plan_id,
    actor_user_id
  ) values (
    p_organization_id,
    subscription_row.id,
    'cancellation_revoked',
    'user',
    subscription_row.status,
    subscription_row.status,
    subscription_row.plan_id,
    p_actor_user_id
  );

  return jsonb_build_object(
    'status', subscription_row.status,
    'cancel_at_period_end', false
  );
end;
$$;

create or replace function public.cancel_pending_paymongo_checkout(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.organization_subscriptions%rowtype;
  actor_role text;
begin
  select member.role into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id
    and coalesce(member.status, 'active') = 'active'
  limit 1;

  if actor_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can cancel a pending checkout.';
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if subscription_row.paymongo_checkout_id is null
     or subscription_row.status <> 'pending' then
    return jsonb_build_object('cancelled', false, 'reason', 'no_pending_checkout');
  end if;

  update public.organization_subscriptions
  set status = case when plan_id is not null then 'active' else 'inactive' end,
      pending_plan_id = null,
      pending_checkout_expires_at = null,
      paymongo_checkout_id = null,
      paymongo_plan_code = null,
      provider_checkout_id = null,
      last_payment_status = 'cancelled',
      updated_at = now()
  where id = subscription_row.id;

  update public.billing_payments
  set status = 'cancelled',
      updated_at = now()
  where organization_id = p_organization_id
    and provider = 'paymongo'
    and provider_checkout_id = subscription_row.paymongo_checkout_id
    and status = 'pending';

  insert into public.subscription_lifecycle_events (
    organization_id,
    subscription_id,
    event_type,
    source,
    previous_status,
    new_status,
    plan_id,
    actor_user_id,
    metadata
  ) values (
    p_organization_id,
    subscription_row.id,
    'checkout_cancelled',
    'user',
    subscription_row.status,
    case when subscription_row.plan_id is not null then 'active' else 'inactive' end,
    subscription_row.plan_id,
    p_actor_user_id,
    jsonb_build_object('checkout_id', subscription_row.paymongo_checkout_id)
  );

  return jsonb_build_object('cancelled', true);
end;
$$;

create or replace function public.expire_pending_paymongo_checkouts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  with expired as (
    update public.organization_subscriptions subscription
    set status = case when subscription.plan_id is not null then 'active' else 'inactive' end,
        pending_plan_id = null,
        pending_checkout_expires_at = null,
        paymongo_checkout_id = null,
        paymongo_plan_code = null,
        provider_checkout_id = null,
        last_payment_status = 'expired',
        updated_at = now()
    where subscription.status = 'pending'
      and subscription.pending_checkout_expires_at is not null
      and subscription.pending_checkout_expires_at <= now()
    returning subscription.*
  ), inserted as (
    insert into public.subscription_lifecycle_events (
      organization_id,
      subscription_id,
      event_type,
      source,
      previous_status,
      new_status,
      plan_id,
      metadata
    )
    select
      expired.organization_id,
      expired.id,
      'checkout_expired',
      'system',
      'pending',
      expired.status,
      expired.plan_id,
      jsonb_build_object('expired_at', now())
    from expired
    returning 1
  )
  select count(*) into affected from inserted;

  update public.billing_payments payment
  set status = 'expired',
      updated_at = now()
  where payment.status = 'pending'
    and exists (
      select 1
      from public.organization_subscriptions subscription
      where subscription.organization_id = payment.organization_id
        and subscription.last_payment_status = 'expired'
    );

  return affected;
end;
$$;

create or replace function public.process_paymongo_lifecycle_event(
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
  p_amount integer,
  p_currency text,
  p_payment_status text,
  p_failure_code text,
  p_failure_message text,
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
  normalized_type text := lower(coalesce(p_event_type, 'unknown'));
  lifecycle_status text;
  old_status text;
begin
  if nullif(trim(p_event_id), '') is null then
    raise exception 'PayMongo event ID is required.';
  end if;

  insert into public.billing_payment_events (
    provider, provider_event_id, event_type, livemode, signature_timestamp,
    provider_resource_type, provider_resource_id, organization_id,
    checkout_id, payment_id, plan_code, payload, status
  ) values (
    'paymongo', p_event_id, coalesce(nullif(trim(p_event_type), ''), 'unknown'),
    p_livemode, p_signature_timestamp, nullif(trim(p_resource_type), ''),
    nullif(trim(p_resource_id), ''), p_organization_id,
    nullif(trim(p_checkout_id), ''), nullif(trim(p_payment_id), ''),
    nullif(trim(p_plan_code), ''), coalesce(p_payload, '{}'::jsonb), 'received'
  )
  on conflict (provider, provider_event_id)
  do update set processing_attempts = billing_payment_events.processing_attempts + 1,
                updated_at = now()
  returning * into event_row;

  if event_row.status in ('processed', 'ignored') then
    return jsonb_build_object('status', event_row.status, 'duplicate', true, 'reason', event_row.ignored_reason);
  end if;

  if normalized_type like '%refund%' then
    lifecycle_status := case when lower(coalesce(p_payment_status, '')) like '%partial%' then 'partially_refunded' else 'refunded' end;
  elsif normalized_type like '%failed%' or lower(coalesce(p_payment_status, '')) = 'failed' then
    lifecycle_status := 'failed';
  elsif normalized_type like '%expired%' then
    lifecycle_status := 'expired';
  elsif normalized_type in ('checkout_session.payment.paid', 'payment.paid')
     or normalized_type like '%.paid'
     or lower(coalesce(p_payment_status, '')) = 'paid' then
    lifecycle_status := 'paid';
  else
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'unsupported_event_type', processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'duplicate', false, 'reason', 'unsupported_event_type');
  end if;

  if p_organization_id is null then
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'missing_organization', processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'reason', 'missing_organization');
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'subscription_not_found', processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'reason', 'subscription_not_found');
  end if;

  old_status := subscription_row.status;

  if lifecycle_status = 'paid' then
    if nullif(trim(p_checkout_id), '') is null or nullif(trim(p_plan_code), '') is null then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'incomplete_paid_metadata', processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'incomplete_paid_metadata');
    end if;

    if subscription_row.paymongo_checkout_id is not null
       and subscription_row.paymongo_checkout_id <> p_checkout_id then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'stale_checkout', processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'stale_checkout');
    end if;

    select * into target_plan
    from public.subscription_plans
    where code = p_plan_code and is_active = true
    limit 1;

    if not found then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'plan_not_found', processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'plan_not_found');
    end if;

    insert into public.billing_payments (
      organization_id, subscription_id, provider, provider_payment_id,
      provider_checkout_id, provider_event_id, plan_id, plan_code,
      status, amount, currency, paid_at, metadata
    ) values (
      p_organization_id, subscription_row.id, 'paymongo', nullif(trim(p_payment_id), ''),
      p_checkout_id, p_event_id, target_plan.id, p_plan_code,
      'paid', p_amount, upper(coalesce(nullif(trim(p_currency), ''), 'PHP')), now(),
      jsonb_build_object('livemode', p_livemode, 'resource_id', p_resource_id)
    )
    on conflict (provider, provider_payment_id) where provider_payment_id is not null
    do update set status = 'paid', provider_event_id = excluded.provider_event_id,
                  paid_at = coalesce(billing_payments.paid_at, now()),
                  amount = coalesce(excluded.amount, billing_payments.amount),
                  updated_at = now();

    update public.organization_subscriptions
    set plan_id = target_plan.id,
        pending_plan_id = null,
        status = 'active',
        billing_provider = 'paymongo',
        paymongo_checkout_id = p_checkout_id,
        paymongo_plan_code = p_plan_code,
        paymongo_payment_id = nullif(trim(p_payment_id), ''),
        provider_checkout_id = p_checkout_id,
        provider_payment_id = nullif(trim(p_payment_id), ''),
        current_period_start = now(),
        current_period_end = now() + interval '1 month',
        pending_checkout_expires_at = null,
        cancel_at_period_end = false,
        activated_at = coalesce(activated_at, now()),
        cancelled_at = null,
        grace_period_ends_at = null,
        payment_failure_count = 0,
        last_payment_status = 'paid',
        last_billing_event_at = now(),
        billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
          'last_event_id', p_event_id,
          'last_event_type', p_event_type,
          'livemode', p_livemode,
          'last_paid_at', now()
        ),
        updated_at = now()
    where id = subscription_row.id;

  elsif lifecycle_status = 'failed' then
    insert into public.billing_payments (
      organization_id, subscription_id, provider, provider_payment_id,
      provider_checkout_id, provider_event_id, plan_id, plan_code,
      status, amount, currency, failure_code, failure_message, metadata
    ) values (
      p_organization_id, subscription_row.id, 'paymongo', nullif(trim(p_payment_id), ''),
      nullif(trim(p_checkout_id), ''), p_event_id, subscription_row.pending_plan_id,
      nullif(trim(p_plan_code), ''), 'failed', p_amount,
      upper(coalesce(nullif(trim(p_currency), ''), 'PHP')),
      nullif(trim(p_failure_code), ''), nullif(trim(p_failure_message), ''),
      jsonb_build_object('livemode', p_livemode)
    )
    on conflict (provider, provider_payment_id) where provider_payment_id is not null
    do update set status = 'failed', failure_code = excluded.failure_code,
                  failure_message = excluded.failure_message, provider_event_id = excluded.provider_event_id,
                  updated_at = now();

    update public.organization_subscriptions
    set status = case
          when current_period_end is not null and current_period_end > now() then status
          when plan_id is not null then 'past_due'
          else 'inactive'
        end,
        payment_failure_count = payment_failure_count + 1,
        grace_period_ends_at = case when plan_id is not null then coalesce(grace_period_ends_at, now() + interval '7 days') else null end,
        last_payment_status = 'failed',
        last_billing_event_at = now(),
        updated_at = now()
    where id = subscription_row.id;

  elsif lifecycle_status in ('refunded', 'partially_refunded') then
    update public.billing_payments
    set status = lifecycle_status,
        refunded_at = now(),
        provider_event_id = p_event_id,
        updated_at = now()
    where organization_id = p_organization_id
      and provider = 'paymongo'
      and (
        (p_payment_id is not null and provider_payment_id = p_payment_id)
        or (p_checkout_id is not null and provider_checkout_id = p_checkout_id)
      );

    update public.organization_subscriptions
    set status = case when lifecycle_status = 'refunded' then 'cancelled' else status end,
        cancelled_at = case when lifecycle_status = 'refunded' then now() else cancelled_at end,
        cancel_at_period_end = false,
        last_payment_status = lifecycle_status,
        last_billing_event_at = now(),
        updated_at = now()
    where id = subscription_row.id;

  elsif lifecycle_status = 'expired' then
    update public.billing_payments
    set status = 'expired', updated_at = now()
    where organization_id = p_organization_id
      and provider = 'paymongo'
      and provider_checkout_id = p_checkout_id
      and status = 'pending';

    if subscription_row.paymongo_checkout_id = p_checkout_id then
      update public.organization_subscriptions
      set status = case when plan_id is not null then 'active' else 'inactive' end,
          pending_plan_id = null,
          pending_checkout_expires_at = null,
          paymongo_checkout_id = null,
          paymongo_plan_code = null,
          provider_checkout_id = null,
          last_payment_status = 'expired',
          last_billing_event_at = now(),
          updated_at = now()
      where id = subscription_row.id;
    end if;
  end if;

  insert into public.subscription_lifecycle_events (
    organization_id, subscription_id, event_type, source,
    previous_status, new_status, plan_id, provider_event_id, metadata
  ) values (
    p_organization_id, subscription_row.id, 'payment_' || lifecycle_status,
    'paymongo_webhook', old_status,
    case
      when lifecycle_status = 'paid' then 'active'
      when lifecycle_status = 'refunded' then 'cancelled'
      when lifecycle_status = 'failed' and subscription_row.plan_id is not null then 'past_due'
      else old_status
    end,
    coalesce(target_plan.id, subscription_row.plan_id), p_event_id,
    jsonb_build_object(
      'checkout_id', p_checkout_id,
      'payment_id', p_payment_id,
      'amount', p_amount,
      'currency', upper(coalesce(nullif(trim(p_currency), ''), 'PHP'))
    )
  ) on conflict (provider_event_id, event_type) where provider_event_id is not null do nothing;

  update public.billing_payment_events
  set organization_id = p_organization_id,
      status = 'processed',
      processed_at = now(),
      updated_at = now()
  where id = event_row.id;

  return jsonb_build_object(
    'status', 'processed',
    'duplicate', false,
    'lifecycle_status', lifecycle_status,
    'organization_id', p_organization_id,
    'subscription_id', subscription_row.id
  );
exception
  when others then
    update public.billing_payment_events
    set status = 'failed', error_message = left(sqlerrm, 2000), updated_at = now()
    where provider = 'paymongo' and provider_event_id = p_event_id;
    return jsonb_build_object('status', 'failed', 'reason', 'processing_error', 'error', left(sqlerrm, 2000));
end;
$$;

revoke all on function public.request_subscription_cancellation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reactivate_subscription(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_pending_paymongo_checkout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_pending_paymongo_checkouts() from public, anon, authenticated;
revoke all on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.request_subscription_cancellation(uuid, uuid) to service_role;
grant execute on function public.reactivate_subscription(uuid, uuid) to service_role;
grant execute on function public.cancel_pending_paymongo_checkout(uuid, uuid) to service_role;
grant execute on function public.expire_pending_paymongo_checkouts() to service_role;
grant execute on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) to service_role;

create or replace function public.enforce_subscription_period_lifecycle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  with ending as (
    update public.organization_subscriptions subscription
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancel_at_period_end = false,
        updated_at = now()
    where subscription.cancel_at_period_end = true
      and subscription.current_period_end is not null
      and subscription.current_period_end <= now()
      and subscription.status in ('active', 'trialing', 'past_due')
    returning subscription.*
  ), logged as (
    insert into public.subscription_lifecycle_events (
      organization_id, subscription_id, event_type, source,
      previous_status, new_status, plan_id, metadata
    )
    select organization_id, id, 'subscription_cancelled', 'system',
           status, 'cancelled', plan_id,
           jsonb_build_object('period_ended_at', current_period_end)
    from ending
    returning 1
  )
  select count(*) into affected from logged;

  with grace_expired as (
    update public.organization_subscriptions subscription
    set status = 'suspended',
        updated_at = now()
    where subscription.status = 'past_due'
      and subscription.grace_period_ends_at is not null
      and subscription.grace_period_ends_at <= now()
    returning subscription.*
  )
  insert into public.subscription_lifecycle_events (
    organization_id, subscription_id, event_type, source,
    previous_status, new_status, plan_id, metadata
  )
  select organization_id, id, 'grace_period_expired', 'system',
         'past_due', 'suspended', plan_id,
         jsonb_build_object('grace_period_ended_at', grace_period_ends_at)
  from grace_expired;

  return affected;
end;
$$;

revoke all on function public.enforce_subscription_period_lifecycle() from public, anon, authenticated;
grant execute on function public.enforce_subscription_period_lifecycle() to service_role;

comment on table public.billing_payments is
  'Provider-neutral payment ledger. PayMongo is the active provider; legacy Stripe values are retained only for history.';
comment on table public.subscription_lifecycle_events is
  'Immutable tenant-scoped subscription lifecycle audit trail.';

commit;

do $$ begin
  if exists(select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule('flowtix-subscription-lifecycle')
      where exists(select 1 from cron.job where jobname = 'flowtix-subscription-lifecycle');
    perform cron.schedule(
      'flowtix-subscription-lifecycle',
      '*/15 * * * *',
      'select public.expire_pending_paymongo_checkouts(); select public.enforce_subscription_period_lifecycle();'
    );
  end if;
exception when others then null; end $$;
