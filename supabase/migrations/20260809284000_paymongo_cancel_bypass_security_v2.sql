begin;

-- Flowtix PayMongo cancellation/timeout bypass fix V2
--
-- Confirmed production behavior:
--   expired trial -> PayMongo checkout -> no payment -> cancel checkout
--   incorrectly restored subscription to ACTIVE.
--
-- Root cause:
--   checkout rollback treated retained plan/billing-period data as proof that
--   the workspace had already paid.
--
-- Security invariant after this migration:
--   1. An expired free trial without a confirmed provider payment can NEVER
--      become active by cancelling or timing out a checkout.
--   2. Only a subscription with concrete evidence of a previously paid period
--      may return to active when cancelling a plan-change checkout.
--   3. A successful PayMongo paid webhook remains the path that activates an
--      expired/unpaid trial.

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
  v_has_confirmed_paid_period boolean := false;
  v_is_expired_unpaid_trial boolean := false;
  restore_status text;
  restore_payment_status text;
begin
  select member.role
  into actor_role
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = p_actor_user_id
    and coalesce(member.status, 'active') = 'active'
  limit 1;

  if actor_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can cancel a pending checkout.';
  end if;

  select *
  into subscription_row
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

  -- Concrete proof that this workspace had already completed a paid period
  -- BEFORE the new checkout was started. A plan_id/current_period_end alone
  -- is not sufficient proof of payment.
  v_has_confirmed_paid_period :=
    subscription_row.plan_id is not null
    and subscription_row.current_period_end is not null
    and subscription_row.current_period_end > now()
    and (
      subscription_row.provider_payment_id is not null
      or subscription_row.paymongo_payment_id is not null
    );

  -- An expired trial with no confirmed payment must remain blocked.
  v_is_expired_unpaid_trial :=
    subscription_row.trial_started_at is not null
    and subscription_row.trial_ends_at is not null
    and subscription_row.trial_ends_at <= now()
    and subscription_row.provider_payment_id is null
    and subscription_row.paymongo_payment_id is null;

  if v_is_expired_unpaid_trial then
    restore_status := 'pending';
    restore_payment_status := 'trial_expired';
  elsif v_has_confirmed_paid_period then
    restore_status := 'active';
    restore_payment_status := 'paid';
  else
    -- Fail closed. Cancellation must never manufacture paid access.
    restore_status := 'inactive';
    restore_payment_status := 'cancelled';
  end if;

  update public.organization_subscriptions
  set
    status = restore_status,
    pending_plan_id = null,
    pending_checkout_expires_at = null,
    paymongo_checkout_id = null,
    paymongo_plan_code = null,
    provider_checkout_id = null,
    -- Preserve historical paid payment IDs only for a genuinely paid period.
    paymongo_payment_id = case
      when v_has_confirmed_paid_period then paymongo_payment_id
      else null
    end,
    provider_payment_id = case
      when v_has_confirmed_paid_period then provider_payment_id
      else null
    end,
    last_payment_status = restore_payment_status,
    billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'checkout_cancelled_at', now(),
        'checkout_cancelled_restore_status', restore_status,
        'checkout_cancelled_restore_payment_status', restore_payment_status,
        'checkout_cancelled_had_confirmed_paid_period',
          v_has_confirmed_paid_period,
        'checkout_cancelled_expired_unpaid_trial',
          v_is_expired_unpaid_trial,
        'checkout_cancelled_security_version', 3
      ),
    updated_at = now()
  where id = subscription_row.id;

  update public.billing_payments
  set
    status = 'cancelled',
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
  )
  values (
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
      'had_confirmed_paid_period', v_has_confirmed_paid_period,
      'expired_unpaid_trial', v_is_expired_unpaid_trial,
      'restore_payment_status', restore_payment_status,
      'security_fix',
        'prevent_cancelled_unpaid_checkout_from_unlocking_workspace_v2'
    )
  );

  return jsonb_build_object(
    'cancelled', true,
    'status', restore_status,
    'last_payment_status', restore_payment_status,
    'workspace_access_restored', restore_status = 'active'
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

      (
        subscription.plan_id is not null
        and subscription.current_period_end is not null
        and subscription.current_period_end > now()
        and (
          subscription.provider_payment_id is not null
          or subscription.paymongo_payment_id is not null
        )
      ) as has_confirmed_paid_period,

      (
        subscription.trial_started_at is not null
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at <= now()
        and subscription.provider_payment_id is null
        and subscription.paymongo_payment_id is null
      ) as expired_unpaid_trial

    from public.organization_subscriptions subscription
    where subscription.status = 'pending'
      and subscription.last_payment_status = 'pending'
      and subscription.pending_checkout_expires_at is not null
      and subscription.pending_checkout_expires_at <= now()
    for update
  ),
  expired as (
    update public.organization_subscriptions subscription
    set
      status = case
        when candidate.expired_unpaid_trial then 'pending'
        when candidate.has_confirmed_paid_period then 'active'
        else 'inactive'
      end,
      pending_plan_id = null,
      pending_checkout_expires_at = null,
      paymongo_checkout_id = null,
      paymongo_plan_code = null,
      provider_checkout_id = null,
      paymongo_payment_id = case
        when candidate.has_confirmed_paid_period
          then subscription.paymongo_payment_id
        else null
      end,
      provider_payment_id = case
        when candidate.has_confirmed_paid_period
          then subscription.provider_payment_id
        else null
      end,
      last_payment_status = case
        when candidate.expired_unpaid_trial then 'trial_expired'
        when candidate.has_confirmed_paid_period then 'paid'
        else 'expired'
      end,
      billing_metadata = coalesce(subscription.billing_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'checkout_expired_at', now(),
          'checkout_expired_had_confirmed_paid_period',
            candidate.has_confirmed_paid_period,
          'checkout_expired_unpaid_trial',
            candidate.expired_unpaid_trial,
          'checkout_expired_security_version', 3
        ),
      updated_at = now()
    from candidates candidate
    where subscription.id = candidate.id
    returning
      subscription.id,
      subscription.organization_id,
      subscription.plan_id,
      candidate.expired_checkout_id,
      candidate.has_confirmed_paid_period,
      candidate.expired_unpaid_trial,
      subscription.status as new_status,
      subscription.last_payment_status as new_payment_status
  ),
  payments as (
    update public.billing_payments payment
    set
      status = 'expired',
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
      expired.new_status,
      expired.plan_id,
      jsonb_build_object(
        'checkout_id', expired.expired_checkout_id,
        'payment_confirmed', false,
        'had_confirmed_paid_period',
          expired.has_confirmed_paid_period,
        'expired_unpaid_trial',
          expired.expired_unpaid_trial,
        'restore_payment_status',
          expired.new_payment_status,
        'security_fix',
          'prevent_expired_unpaid_checkout_from_unlocking_workspace_v2'
      )
    from expired
    returning 1
  )
  select count(*)
  into v_affected
  from events;

  -- Preserve existing stale checkout-creation lease cleanup.
  update public.organization_subscriptions
  set
    checkout_creation_token = null,
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


-- Repair rows already unlocked by the old cancellation/expiry behavior.
-- Scope is intentionally narrow:
--   * trial has ended
--   * no confirmed PayMongo/provider payment exists
--   * row was made ACTIVE
--   * last payment state is one produced by cancellation/expiry
update public.organization_subscriptions
set
  status = 'pending',
  last_payment_status = 'trial_expired',
  pending_plan_id = null,
  pending_checkout_expires_at = null,
  paymongo_checkout_id = null,
  paymongo_plan_code = null,
  provider_checkout_id = null,
  paymongo_payment_id = null,
  provider_payment_id = null,
  billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'unpaid_access_repaired_at', now(),
      'unpaid_access_repair_reason',
        'expired_trial_was_incorrectly_activated_after_unpaid_checkout',
      'unpaid_access_security_version', 3
    ),
  updated_at = now()
where status = 'active'
  and trial_started_at is not null
  and trial_ends_at is not null
  and trial_ends_at <= now()
  and provider_payment_id is null
  and paymongo_payment_id is null
  and last_payment_status in ('cancelled', 'expired', 'trial_expired');


revoke all on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  to service_role;

revoke all on function public.expire_pending_paymongo_checkouts()
  from public, anon, authenticated;

grant execute on function public.expire_pending_paymongo_checkouts()
  to service_role;

comment on function public.cancel_pending_paymongo_checkout(uuid, uuid) is
  'Cancels PayMongo checkout without granting unpaid workspace access. Active restoration requires a future paid period plus a persisted provider payment identifier.';

comment on function public.expire_pending_paymongo_checkouts() is
  'Expires pending PayMongo checkouts without granting unpaid workspace access. Active restoration requires concrete evidence of an existing paid period.';

notify pgrst, 'reload schema';

commit;
