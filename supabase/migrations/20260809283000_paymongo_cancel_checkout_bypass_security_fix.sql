begin;

-- Flowtix PayMongo checkout cancellation / expiry security fix
--
-- Security issue:
--   cancel_pending_paymongo_checkout() and expire_pending_paymongo_checkouts()
--   previously restored `active` whenever plan_id was non-null.
--
-- An expired free trial intentionally retains plan_id so Flowtix knows which
-- plan the workspace selected. Therefore an unpaid expired trial could become
-- active simply by cancelling (or waiting for expiry of) a PayMongo checkout.
--
-- Correct invariant:
--   * An expired/unpaid trial remains `pending / trial_expired` until a
--     confirmed PayMongo paid event activates it.
--   * A currently-paid subscription with a future billing period may return
--     to `active / paid` when an upgrade checkout is cancelled.
--   * An unpaid non-trial subscription must not become active merely because
--     plan_id is populated.

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
  restore_status text;
  restore_payment_status text;
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
     or subscription_row.status <> 'pending'
     or subscription_row.last_payment_status <> 'pending' then
    return jsonb_build_object(
      'cancelled', false,
      'reason', 'no_pending_checkout'
    );
  end if;

  -- An expired free trial remains blocked until PayMongo confirms payment.
  if subscription_row.trial_started_at is not null
     and subscription_row.trial_ends_at is not null
     and subscription_row.trial_ends_at <= now()
     and (
       subscription_row.current_period_end is null
       or subscription_row.current_period_end <= now()
     ) then
    restore_status := 'pending';
    restore_payment_status := 'trial_expired';

  -- A genuinely paid subscription can safely return to its already-paid plan.
  elsif subscription_row.plan_id is not null
        and subscription_row.current_period_end is not null
        and subscription_row.current_period_end > now() then
    restore_status := 'active';
    restore_payment_status := 'paid';

  -- Never grant access merely because plan_id exists.
  else
    restore_status := 'inactive';
    restore_payment_status := 'cancelled';
  end if;

  update public.organization_subscriptions
  set status = restore_status,
      pending_plan_id = null,
      pending_checkout_expires_at = null,
      paymongo_checkout_id = null,
      paymongo_plan_code = null,
      provider_checkout_id = null,
      paymongo_payment_id = case
        when restore_status = 'active' then paymongo_payment_id
        else null
      end,
      provider_payment_id = case
        when restore_status = 'active' then provider_payment_id
        else null
      end,
      last_payment_status = restore_payment_status,
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'checkout_cancelled_at', now(),
          'checkout_cancelled_restore_status', restore_status,
          'checkout_cancelled_restore_payment_status', restore_payment_status,
          'checkout_cancelled_security_version', 2
        ),
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
    restore_status,
    subscription_row.plan_id,
    p_actor_user_id,
    jsonb_build_object(
      'checkout_id', subscription_row.paymongo_checkout_id,
      'payment_confirmed', false,
      'restore_payment_status', restore_payment_status,
      'security_fix', 'prevent_unpaid_checkout_cancellation_activation'
    )
  );

  return jsonb_build_object(
    'cancelled', true,
    'status', restore_status,
    'last_payment_status', restore_payment_status
  );
end;
$$;

create or replace function public.expire_pending_paymongo_checkouts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  with candidates as (
    select
      subscription.id,
      subscription.organization_id,
      subscription.plan_id,
      subscription.paymongo_checkout_id as expired_checkout_id,
      case
        when subscription.trial_started_at is not null
          and subscription.trial_ends_at is not null
          and subscription.trial_ends_at <= now()
          and (
            subscription.current_period_end is null
            or subscription.current_period_end <= now()
          )
          then 'pending'
        when subscription.plan_id is not null
          and subscription.current_period_end is not null
          and subscription.current_period_end > now()
          then 'active'
        else 'inactive'
      end as restore_status,
      case
        when subscription.trial_started_at is not null
          and subscription.trial_ends_at is not null
          and subscription.trial_ends_at <= now()
          and (
            subscription.current_period_end is null
            or subscription.current_period_end <= now()
          )
          then 'trial_expired'
        when subscription.plan_id is not null
          and subscription.current_period_end is not null
          and subscription.current_period_end > now()
          then 'paid'
        else 'expired'
      end as restore_payment_status
    from public.organization_subscriptions subscription
    where subscription.status = 'pending'
      and subscription.last_payment_status = 'pending'
      and subscription.pending_checkout_expires_at is not null
      and subscription.pending_checkout_expires_at <= now()
    for update
  ),
  expired as (
    update public.organization_subscriptions subscription
    set status = candidate.restore_status,
        pending_plan_id = null,
        pending_checkout_expires_at = null,
        paymongo_checkout_id = null,
        paymongo_plan_code = null,
        provider_checkout_id = null,
        paymongo_payment_id = case
          when candidate.restore_status = 'active'
            then subscription.paymongo_payment_id
          else null
        end,
        provider_payment_id = case
          when candidate.restore_status = 'active'
            then subscription.provider_payment_id
          else null
        end,
        last_payment_status = candidate.restore_payment_status,
        billing_metadata = coalesce(subscription.billing_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'checkout_expired_at', now(),
            'checkout_expired_restore_status', candidate.restore_status,
            'checkout_expired_restore_payment_status',
              candidate.restore_payment_status,
            'checkout_expired_security_version', 2
          ),
        updated_at = now()
    from candidates candidate
    where subscription.id = candidate.id
    returning
      subscription.id,
      subscription.organization_id,
      subscription.plan_id,
      candidate.expired_checkout_id,
      candidate.restore_status,
      candidate.restore_payment_status
  ),
  payments as (
    update public.billing_payments payment
    set status = 'expired',
        updated_at = now()
    from expired
    where payment.subscription_id = expired.id
      and payment.provider = 'paymongo'
      and payment.provider_checkout_id = expired.expired_checkout_id
      and payment.status = 'pending'
    returning payment.id
  ),
  events as (
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
      expired.restore_status,
      expired.plan_id,
      jsonb_build_object(
        'checkout_id', expired.expired_checkout_id,
        'payment_confirmed', false,
        'restore_payment_status', expired.restore_payment_status,
        'security_fix', 'prevent_unpaid_checkout_expiry_activation'
      )
    from expired
    returning 1
  )
  select count(*) into v_affected from events;

  -- Preserve the existing stale checkout-creation lease cleanup.
  update public.organization_subscriptions
  set checkout_creation_token = null,
      checkout_creation_started_at = null,
      pending_plan_id = case
        when paymongo_checkout_id is null then null
        else pending_plan_id
      end,
      updated_at = now()
  where checkout_creation_token is not null
    and checkout_creation_started_at < now() - interval '15 minutes';

  return v_affected;
end;
$$;

revoke all on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  to service_role;

revoke all on function public.expire_pending_paymongo_checkouts()
  from public, anon, authenticated;

grant execute on function public.expire_pending_paymongo_checkouts()
  to service_role;

comment on function public.cancel_pending_paymongo_checkout(uuid, uuid) is
  'Cancels a pending PayMongo checkout without granting unpaid access. Expired trials remain payment-required; only subscriptions with a currently-paid future billing period may return active.';

comment on function public.expire_pending_paymongo_checkouts() is
  'Expires stale PayMongo checkouts without granting unpaid access. Expired trials remain payment-required; only subscriptions with a currently-paid future billing period may return active.';

notify pgrst, 'reload schema';

commit;
