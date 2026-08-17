begin;

-- Phase 8: paid plan-change lifecycle and entitlement refresh.
--
-- Rules:
--   * Active trial plan switches remain immediate and free through
--     switch_flowtix_trial_plan_if_active().
--   * Paid upgrades require a successful PayMongo checkout before plan_id moves.
--   * Paid downgrades are scheduled for the current period end.
--   * At the period boundary a scheduled downgrade becomes the plan/entitlement
--     source before renewal payment is requested. Existing customer data is not
--     deleted; lower-plan quotas simply govern subsequent writes/activations.
--   * A paid activation clears any stale scheduled change.

create or replace function public.schedule_subscription_plan_change(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_plan_code text,
  p_effective text default 'period_end'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_current_plan public.subscription_plans%rowtype;
  v_role text;
  v_when timestamptz;
  v_previous_scheduled_plan_id uuid;
begin
  select role
  into v_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_actor_user_id
    and coalesce(status, 'active') = 'active'
  limit 1;

  if v_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can change plans.';
  end if;

  if lower(coalesce(p_effective, '')) <> 'period_end' then
    raise exception 'Paid downgrades must take effect at the end of the current billing period.';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where lower(code) = lower(trim(p_plan_code))
    and is_active = true
    and coalesce(is_public, true) = true
    and billing_provider = 'paymongo'
  limit 1;

  if not found then
    raise exception 'Plan not found.';
  end if;

  select *
  into v_sub
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'Only an active paid subscription can schedule a downgrade.';
  end if;

  if v_sub.cancel_at_period_end then
    raise exception 'Reactivate the subscription before scheduling a plan change.';
  end if;

  if v_sub.paymongo_checkout_id is not null
     and v_sub.pending_checkout_expires_at is not null
     and v_sub.pending_checkout_expires_at > now()
     and v_sub.last_payment_status = 'pending' then
    raise exception 'Complete or cancel the pending PayMongo checkout first.';
  end if;

  if v_sub.plan_id = v_plan.id then
    raise exception 'The subscription already uses this plan.';
  end if;

  if v_sub.current_period_end is null
     or v_sub.current_period_end <= now() then
    raise exception 'A future billing-period end is required before a downgrade can be scheduled.';
  end if;

  select *
  into v_current_plan
  from public.subscription_plans
  where id = v_sub.plan_id
  limit 1;

  if not found then
    raise exception 'The current subscription plan could not be resolved.';
  end if;

  if v_plan.sort_order >= v_current_plan.sort_order then
    raise exception 'Paid upgrades require PayMongo checkout and activate only after payment confirmation.';
  end if;

  v_when := v_sub.current_period_end;
  v_previous_scheduled_plan_id := v_sub.scheduled_plan_id;

  if v_sub.scheduled_plan_id = v_plan.id
     and v_sub.scheduled_plan_effective_at = v_when then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'effective', 'period_end',
      'effective_at', v_when,
      'plan_code', v_plan.code,
      'requires_paymongo_payment_at_renewal', true
    );
  end if;

  update public.organization_subscriptions
  set scheduled_plan_id = v_plan.id,
      scheduled_plan_effective_at = v_when,
      lifecycle_version = coalesce(lifecycle_version, 1) + 1,
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'scheduled_plan_code', v_plan.code,
          'scheduled_plan_effective_at', v_when,
          'scheduled_plan_requested_at', now()
        ),
      updated_at = now()
  where id = v_sub.id;

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
    v_sub.id,
    'plan_change_scheduled',
    'user',
    v_sub.status,
    v_sub.status,
    v_plan.id,
    p_actor_user_id,
    jsonb_build_object(
      'effective', 'period_end',
      'effective_at', v_when,
      'previous_plan_id', v_sub.plan_id,
      'previous_plan_code', v_current_plan.code,
      'previous_scheduled_plan_id', v_previous_scheduled_plan_id,
      'new_plan_id', v_plan.id,
      'new_plan_code', v_plan.code,
      'requires_paymongo_payment_at_renewal', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'effective', 'period_end',
    'effective_at', v_when,
    'plan_code', v_plan.code,
    'requires_paymongo_payment_at_renewal', true
  );
end;
$$;

create or replace function public.cancel_scheduled_subscription_plan_change(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_scheduled_plan public.subscription_plans%rowtype;
  v_role text;
begin
  select role
  into v_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_actor_user_id
    and coalesce(status, 'active') = 'active'
  limit 1;

  if v_role is distinct from 'owner' then
    raise exception 'Only the workspace owner can change plans.';
  end if;

  select *
  into v_sub
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if v_sub.scheduled_plan_id is null then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'plan_id', v_sub.plan_id
    );
  end if;

  select *
  into v_scheduled_plan
  from public.subscription_plans
  where id = v_sub.scheduled_plan_id
  limit 1;

  update public.organization_subscriptions
  set scheduled_plan_id = null,
      scheduled_plan_effective_at = null,
      lifecycle_version = coalesce(lifecycle_version, 1) + 1,
      billing_metadata = (
        coalesce(billing_metadata, '{}'::jsonb)
          - 'scheduled_plan_code'
          - 'scheduled_plan_effective_at'
          - 'scheduled_plan_requested_at'
      ) || jsonb_build_object(
        'scheduled_plan_cancelled_at', now()
      ),
      updated_at = now()
  where id = v_sub.id;

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
    v_sub.id,
    'plan_change_cancelled',
    'user',
    v_sub.status,
    v_sub.status,
    v_sub.plan_id,
    p_actor_user_id,
    jsonb_build_object(
      'cancelled_scheduled_plan_id', v_sub.scheduled_plan_id,
      'cancelled_scheduled_plan_code',
        case when v_scheduled_plan.id is null then null else v_scheduled_plan.code end,
      'cancelled_effective_at', v_sub.scheduled_plan_effective_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'cancelled_plan_id', v_sub.scheduled_plan_id,
    'cancelled_plan_code',
      case when v_scheduled_plan.id is null then null else v_scheduled_plan.code end
  );
end;
$$;

create or replace function public.process_subscription_renewals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r public.organization_subscriptions%rowtype;
  v_scheduled_plan public.subscription_plans%rowtype;
  v_effective_plan_id uuid;
  v_effective_plan_code text;
begin
  for r in
    select *
    from public.organization_subscriptions
    where current_period_end is not null
      and current_period_end <= now()
      and status in ('active', 'trialing', 'past_due')
      and (next_renewal_attempt_at is null or next_renewal_attempt_at <= now())
    for update skip locked
  loop
    if r.cancel_at_period_end then
      update public.organization_subscriptions
      set status = 'cancelled',
          cancelled_at = coalesce(cancelled_at, now()),
          cancel_at_period_end = false,
          scheduled_plan_id = null,
          scheduled_plan_effective_at = null,
          pending_plan_id = null,
          pending_checkout_expires_at = null,
          paymongo_checkout_id = null,
          provider_checkout_id = null,
          next_renewal_attempt_at = null,
          lifecycle_version = coalesce(lifecycle_version, 1) + 1,
          updated_at = now()
      where id = r.id;

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
      values (
        r.organization_id,
        r.id,
        'subscription_cancelled',
        'system',
        r.status,
        'cancelled',
        r.plan_id,
        jsonb_build_object('effective_at', r.current_period_end)
      );
    else
      v_effective_plan_id := r.plan_id;
      v_effective_plan_code := r.paymongo_plan_code;

      if v_effective_plan_code is null and r.plan_id is not null then
        select plan.code
        into v_effective_plan_code
        from public.subscription_plans plan
        where plan.id = r.plan_id
        limit 1;
      end if;

      if r.scheduled_plan_id is not null
         and coalesce(r.scheduled_plan_effective_at, r.current_period_end) <= now() then
        select *
        into v_scheduled_plan
        from public.subscription_plans
        where id = r.scheduled_plan_id
          and billing_provider = 'paymongo'
          and is_active = true
        limit 1;

        if found then
          v_effective_plan_id := v_scheduled_plan.id;
          v_effective_plan_code := v_scheduled_plan.code;

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
          values (
            r.organization_id,
            r.id,
            'plan_change_applied',
            'system',
            r.status,
            'past_due',
            v_scheduled_plan.id,
            jsonb_build_object(
              'previous_plan_id', r.plan_id,
              'new_plan_id', v_scheduled_plan.id,
              'new_plan_code', v_scheduled_plan.code,
              'effective_at',
                coalesce(r.scheduled_plan_effective_at, r.current_period_end),
              'payment_required', true,
              'data_deleted', false
            )
          );
        end if;
      end if;

      update public.organization_subscriptions
      set plan_id = v_effective_plan_id,
          paymongo_plan_code = v_effective_plan_code,
          scheduled_plan_id = null,
          scheduled_plan_effective_at = null,
          status = 'past_due',
          grace_period_ends_at = coalesce(
            grace_period_ends_at,
            now() + interval '7 days'
          ),
          renewal_attempt_count = coalesce(renewal_attempt_count, 0) + 1,
          next_renewal_attempt_at = now() + interval '24 hours',
          lifecycle_version = coalesce(lifecycle_version, 1) + 1,
          billing_metadata = (
            coalesce(billing_metadata, '{}'::jsonb)
              - 'scheduled_plan_code'
              - 'scheduled_plan_effective_at'
              - 'scheduled_plan_requested_at'
          ) || jsonb_build_object(
            'renewal_payment_required_at', now(),
            'renewal_plan_id', v_effective_plan_id,
            'renewal_plan_code', v_effective_plan_code
          ),
          updated_at = now()
      where id = r.id;

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
      values (
        r.organization_id,
        r.id,
        'renewal_payment_required',
        'system',
        r.status,
        'past_due',
        v_effective_plan_id,
        jsonb_build_object(
          'period_end', r.current_period_end,
          'grace_period_days', 7,
          'renewal_plan_id', v_effective_plan_id,
          'renewal_plan_code', v_effective_plan_code
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.begin_paymongo_checkout_creation(
  p_organization_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_amount integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_current_plan public.subscription_plans%rowtype;
  v_token uuid := gen_random_uuid();
  v_plan_code text := lower(nullif(trim(p_plan_code), ''));
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'PHP'));
begin
  if p_organization_id is null then
    raise exception 'Organization is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'A positive checkout amount is required.';
  end if;

  if v_currency <> 'PHP' then
    raise exception 'Flowtix PayMongo checkout currency must be PHP.';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = p_plan_id
    and code = v_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and coalesce(is_public, true) = true
  for share;

  if not found then
    raise exception 'The selected PayMongo plan is unavailable.';
  end if;

  if v_plan.monthly_price_cents is distinct from p_amount then
    raise exception 'Checkout amount does not match the selected plan.';
  end if;

  select *
  into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription record was not found.';
  end if;

  if v_subscription.checkout_creation_token is not null
     and v_subscription.checkout_creation_started_at > now() - interval '10 minutes' then
    raise exception 'A PayMongo checkout is already being created. Please wait and try again.';
  end if;

  if v_subscription.paymongo_checkout_id is not null
     and v_subscription.pending_checkout_expires_at is not null
     and v_subscription.pending_checkout_expires_at > now()
     and v_subscription.last_payment_status = 'pending' then
    raise exception 'A PayMongo checkout is already pending. Complete or cancel it first.';
  end if;

  if v_subscription.status = 'active'
     and v_subscription.current_period_end is not null
     and v_subscription.current_period_end > now() then
    if v_subscription.cancel_at_period_end then
      raise exception 'Reactivate the subscription before changing plans.';
    end if;

    select *
    into v_current_plan
    from public.subscription_plans
    where id = v_subscription.plan_id
    limit 1;

    if not found then
      raise exception 'The current subscription plan could not be resolved.';
    end if;

    if v_plan.id = v_current_plan.id then
      raise exception 'The subscription already uses this plan.';
    end if;

    if v_plan.sort_order < v_current_plan.sort_order then
      raise exception 'Paid downgrades must be scheduled for the end of the current billing period.';
    end if;
  end if;

  update public.organization_subscriptions
  set checkout_creation_token = v_token,
      checkout_creation_started_at = now(),
      pending_plan_id = v_plan.id,
      billing_provider = 'paymongo',
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'checkout_creation_started_at', now(),
          'requested_plan_code', v_plan_code
        ),
      updated_at = now()
  where id = v_subscription.id;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'creation_token', v_token,
    'plan_id', v_plan.id,
    'plan_code', v_plan.code
  );
end;
$$;


create or replace function public.finalize_paymongo_checkout_creation(
  p_organization_id uuid,
  p_creation_token uuid,
  p_checkout_id text,
  p_plan_id uuid,
  p_plan_code text,
  p_amount integer,
  p_currency text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_current_plan public.subscription_plans%rowtype;
  v_checkout_id text := nullif(trim(p_checkout_id), '');
  v_plan_code text := lower(nullif(trim(p_plan_code), ''));
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'PHP'));
  v_payment_id uuid;
  v_has_confirmed_paid_period boolean := false;
  v_has_past_due_grace boolean := false;
  v_current_plan_code text := null;
begin
  if p_creation_token is null then
    raise exception 'Checkout creation token is required.';
  end if;

  if v_checkout_id is null or length(v_checkout_id) > 255 then
    raise exception 'A valid PayMongo checkout ID is required.';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Checkout expiration must be in the future.';
  end if;

  if v_currency <> 'PHP' then
    raise exception 'Flowtix PayMongo checkout currency must be PHP.';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = p_plan_id
    and code = v_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and coalesce(is_public, true) = true
  for share;

  if not found then
    raise exception 'The selected PayMongo plan is unavailable.';
  end if;

  if v_plan.monthly_price_cents is distinct from p_amount then
    raise exception 'Checkout amount does not match the selected plan.';
  end if;

  select *
  into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription record was not found.';
  end if;

  if v_subscription.checkout_creation_token is distinct from p_creation_token then
    raise exception 'The checkout creation lease is no longer valid.';
  end if;

  if v_subscription.checkout_creation_started_at is null
     or v_subscription.checkout_creation_started_at < now() - interval '15 minutes' then
    raise exception 'The checkout creation lease expired.';
  end if;

  if v_subscription.pending_plan_id is distinct from v_plan.id then
    raise exception 'The pending plan changed while checkout was being created.';
  end if;

  v_has_confirmed_paid_period :=
    v_subscription.status = 'active'
    and v_subscription.plan_id is not null
    and v_subscription.current_period_end is not null
    and v_subscription.current_period_end > now()
    and (
      v_subscription.provider_payment_id is not null
      or v_subscription.paymongo_payment_id is not null
    );

  v_has_past_due_grace :=
    v_subscription.status = 'past_due'
    and v_subscription.plan_id is not null
    and v_subscription.grace_period_ends_at is not null
    and v_subscription.grace_period_ends_at > now()
    and (
      v_subscription.provider_payment_id is not null
      or v_subscription.paymongo_payment_id is not null
    );

  if v_subscription.plan_id is not null then
    select *
    into v_current_plan
    from public.subscription_plans
    where id = v_subscription.plan_id
    limit 1;

    if found then
      v_current_plan_code := v_current_plan.code;
    end if;
  end if;

  insert into public.billing_payments (
    organization_id,
    subscription_id,
    provider,
    provider_checkout_id,
    plan_id,
    plan_code,
    status,
    amount,
    currency,
    metadata
  )
  values (
    p_organization_id,
    v_subscription.id,
    'paymongo',
    v_checkout_id,
    v_plan.id,
    v_plan_code,
    'pending',
    p_amount,
    v_currency,
    jsonb_build_object(
      'checkout_expires_at', p_expires_at,
      'creation_token', p_creation_token,
      'preserved_active_paid_period', v_has_confirmed_paid_period,
      'preserved_past_due_grace', v_has_past_due_grace
    )
  )
  on conflict (provider, provider_checkout_id)
    where provider = 'paymongo' and provider_checkout_id is not null
  do update set
    subscription_id = excluded.subscription_id,
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    amount = excluded.amount,
    currency = excluded.currency,
    status = case
      when billing_payments.status = 'paid' then billing_payments.status
      else 'pending'
    end,
    metadata = billing_payments.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_payment_id;

  update public.organization_subscriptions
  set status = case
        when v_has_confirmed_paid_period then 'active'
        when v_has_past_due_grace then 'past_due'
        else 'pending'
      end,
      paymongo_checkout_id = v_checkout_id,
      paymongo_plan_code = case
        when v_has_confirmed_paid_period or v_has_past_due_grace
          then coalesce(v_current_plan_code, paymongo_plan_code)
        else v_plan_code
      end,
      paymongo_payment_id = case
        when v_has_confirmed_paid_period or v_has_past_due_grace
          then paymongo_payment_id
        else null
      end,
      provider_checkout_id = v_checkout_id,
      provider_payment_id = case
        when v_has_confirmed_paid_period or v_has_past_due_grace
          then provider_payment_id
        else null
      end,
      pending_plan_id = v_plan.id,
      pending_checkout_expires_at = p_expires_at,
      last_payment_status = 'pending',
      checkout_creation_token = null,
      checkout_creation_started_at = null,
      billing_metadata = (
        coalesce(billing_metadata, '{}'::jsonb)
          - 'checkout_creation_started_at'
      ) || jsonb_build_object(
        'checkout_created_at', now(),
        'requested_plan_code', v_plan_code,
        'checkout_expires_at', p_expires_at,
        'preserved_active_paid_period', v_has_confirmed_paid_period,
        'preserved_past_due_grace', v_has_past_due_grace,
        'active_plan_code_during_checkout', v_current_plan_code
      ),
      updated_at = now()
  where id = v_subscription.id;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'payment_id', v_payment_id,
    'checkout_id', v_checkout_id,
    'plan_code', v_plan_code,
    'preserved_active_paid_period', v_has_confirmed_paid_period,
    'preserved_past_due_grace', v_has_past_due_grace
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
  current_plan public.subscription_plans%rowtype;
  actor_role text;
  v_has_confirmed_paid_period boolean := false;
  v_has_past_due_grace boolean := false;
  v_is_expired_unpaid_trial boolean := false;
  restore_status text;
  restore_payment_status text;
  restore_plan_code text := null;
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
     or subscription_row.pending_plan_id is null
     or subscription_row.last_payment_status <> 'pending' then
    return jsonb_build_object(
      'cancelled', false,
      'reason', 'no_pending_checkout'
    );
  end if;

  if subscription_row.plan_id is not null then
    select *
    into current_plan
    from public.subscription_plans
    where id = subscription_row.plan_id
    limit 1;

    if found then
      restore_plan_code := current_plan.code;
    end if;
  end if;

  v_has_confirmed_paid_period :=
    subscription_row.status = 'active'
    and subscription_row.plan_id is not null
    and subscription_row.current_period_end is not null
    and subscription_row.current_period_end > now()
    and (
      subscription_row.provider_payment_id is not null
      or subscription_row.paymongo_payment_id is not null
    );

  v_has_past_due_grace :=
    subscription_row.status = 'past_due'
    and subscription_row.plan_id is not null
    and subscription_row.grace_period_ends_at is not null
    and subscription_row.grace_period_ends_at > now()
    and (
      subscription_row.provider_payment_id is not null
      or subscription_row.paymongo_payment_id is not null
    );

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
  elsif v_has_past_due_grace then
    restore_status := 'past_due';
    restore_payment_status := 'paid';
  else
    restore_status := 'inactive';
    restore_payment_status := 'cancelled';
  end if;

  update public.organization_subscriptions
  set status = restore_status,
      pending_plan_id = null,
      pending_checkout_expires_at = null,
      paymongo_checkout_id = null,
      paymongo_plan_code = case
        when v_has_confirmed_paid_period or v_has_past_due_grace
          then restore_plan_code
        else null
      end,
      provider_checkout_id = null,
      paymongo_payment_id = case
        when v_has_confirmed_paid_period or v_has_past_due_grace
          then paymongo_payment_id
        else null
      end,
      provider_payment_id = case
        when v_has_confirmed_paid_period or v_has_past_due_grace
          then provider_payment_id
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
          'checkout_cancelled_preserved_past_due_grace',
            v_has_past_due_grace,
          'checkout_cancelled_expired_unpaid_trial',
            v_is_expired_unpaid_trial,
          'checkout_cancelled_preserved_scheduled_plan',
            subscription_row.scheduled_plan_id is not null,
          'checkout_cancelled_security_version', 4
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
      'preserved_past_due_grace', v_has_past_due_grace,
      'expired_unpaid_trial', v_is_expired_unpaid_trial,
      'restore_payment_status', restore_payment_status,
      'scheduled_plan_preserved',
        subscription_row.scheduled_plan_id is not null,
      'security_fix',
        'preserve_active_paid_access_during_plan_upgrade_checkout_v1'
    )
  );

  return jsonb_build_object(
    'cancelled', true,
    'status', restore_status,
    'last_payment_status', restore_payment_status,
    'workspace_access_restored',
      restore_status in ('active', 'past_due'),
    'scheduled_plan_preserved',
      subscription_row.scheduled_plan_id is not null
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
      subscription.status as previous_status,
      subscription.scheduled_plan_id,
      subscription.paymongo_checkout_id as expired_checkout_id,
      plan.code as current_plan_code,

      (
        subscription.status = 'active'
        and subscription.plan_id is not null
        and subscription.current_period_end is not null
        and subscription.current_period_end > now()
        and (
          subscription.provider_payment_id is not null
          or subscription.paymongo_payment_id is not null
        )
      ) as has_confirmed_paid_period,

      (
        subscription.status = 'past_due'
        and subscription.plan_id is not null
        and subscription.grace_period_ends_at is not null
        and subscription.grace_period_ends_at > now()
        and (
          subscription.provider_payment_id is not null
          or subscription.paymongo_payment_id is not null
        )
      ) as has_past_due_grace,

      (
        subscription.trial_started_at is not null
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at <= now()
        and subscription.provider_payment_id is null
        and subscription.paymongo_payment_id is null
      ) as expired_unpaid_trial

    from public.organization_subscriptions subscription
    left join public.subscription_plans plan
      on plan.id = subscription.plan_id
    where subscription.last_payment_status = 'pending'
      and subscription.paymongo_checkout_id is not null
      and subscription.pending_plan_id is not null
      and subscription.pending_checkout_expires_at is not null
      and subscription.pending_checkout_expires_at <= now()
      and subscription.status in ('pending', 'active', 'past_due')
    for update of subscription
  ),
  expired as (
    update public.organization_subscriptions subscription
    set status = case
          when candidate.expired_unpaid_trial then 'pending'
          when candidate.has_confirmed_paid_period then 'active'
          when candidate.has_past_due_grace then 'past_due'
          else 'inactive'
        end,
        pending_plan_id = null,
        pending_checkout_expires_at = null,
        paymongo_checkout_id = null,
        paymongo_plan_code = case
          when candidate.has_confirmed_paid_period
            or candidate.has_past_due_grace
            then candidate.current_plan_code
          else null
        end,
        provider_checkout_id = null,
        paymongo_payment_id = case
          when candidate.has_confirmed_paid_period
            or candidate.has_past_due_grace
            then subscription.paymongo_payment_id
          else null
        end,
        provider_payment_id = case
          when candidate.has_confirmed_paid_period
            or candidate.has_past_due_grace
            then subscription.provider_payment_id
          else null
        end,
        last_payment_status = case
          when candidate.expired_unpaid_trial then 'trial_expired'
          when candidate.has_confirmed_paid_period
            or candidate.has_past_due_grace then 'paid'
          else 'expired'
        end,
        billing_metadata = coalesce(subscription.billing_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'checkout_expired_at', now(),
            'checkout_expired_had_confirmed_paid_period',
              candidate.has_confirmed_paid_period,
            'checkout_expired_preserved_past_due_grace',
              candidate.has_past_due_grace,
            'checkout_expired_unpaid_trial',
              candidate.expired_unpaid_trial,
            'checkout_expired_preserved_scheduled_plan',
              candidate.scheduled_plan_id is not null,
            'checkout_expired_security_version', 4
          ),
        updated_at = now()
    from candidates candidate
    where subscription.id = candidate.id
    returning
      subscription.id,
      subscription.organization_id,
      subscription.plan_id,
      candidate.previous_status,
      candidate.expired_checkout_id,
      candidate.has_confirmed_paid_period,
      candidate.has_past_due_grace,
      candidate.expired_unpaid_trial,
      candidate.scheduled_plan_id,
      subscription.status as new_status,
      subscription.last_payment_status as new_payment_status
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
      expired.previous_status,
      expired.new_status,
      expired.plan_id,
      jsonb_build_object(
        'checkout_id', expired.expired_checkout_id,
        'payment_confirmed', false,
        'had_confirmed_paid_period',
          expired.has_confirmed_paid_period,
        'preserved_past_due_grace',
          expired.has_past_due_grace,
        'expired_unpaid_trial',
          expired.expired_unpaid_trial,
        'restore_payment_status',
          expired.new_payment_status,
        'scheduled_plan_preserved',
          expired.scheduled_plan_id is not null,
        'security_fix',
          'preserve_active_paid_access_during_plan_upgrade_checkout_v1'
      )
    from expired
    returning 1
  )
  select count(*)
  into v_affected
  from events;

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

create or replace function public.clear_activated_scheduled_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.scheduled_plan_id is not null
     and new.status = 'active'
     and new.last_payment_status = 'paid'
     and new.plan_id is distinct from old.plan_id then
    new.scheduled_plan_id := null;
    new.scheduled_plan_effective_at := null;
    new.billing_metadata := (
      coalesce(new.billing_metadata, '{}'::jsonb)
        - 'scheduled_plan_code'
        - 'scheduled_plan_effective_at'
        - 'scheduled_plan_requested_at'
    ) || jsonb_build_object(
      'scheduled_plan_cleared_at', now(),
      'scheduled_plan_previous_id', old.scheduled_plan_id,
      'scheduled_plan_replaced_by_paid_plan_id', new.plan_id
    );
  end if;

  return new;
end;
$$;

revoke all on function public.schedule_subscription_plan_change(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.cancel_scheduled_subscription_plan_change(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.process_subscription_renewals()
  from public, anon, authenticated;
revoke all on function public.begin_paymongo_checkout_creation(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.finalize_paymongo_checkout_creation(uuid, uuid, text, uuid, text, integer, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.expire_pending_paymongo_checkouts()
  from public, anon, authenticated;

grant execute on function public.schedule_subscription_plan_change(uuid, uuid, text, text)
  to service_role;
grant execute on function public.cancel_scheduled_subscription_plan_change(uuid, uuid)
  to service_role;
grant execute on function public.process_subscription_renewals()
  to service_role;
grant execute on function public.begin_paymongo_checkout_creation(uuid, uuid, text, integer, text)
  to service_role;
grant execute on function public.finalize_paymongo_checkout_creation(uuid, uuid, text, uuid, text, integer, text, timestamptz)
  to service_role;
grant execute on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  to service_role;
grant execute on function public.expire_pending_paymongo_checkouts()
  to service_role;

comment on function public.schedule_subscription_plan_change(uuid, uuid, text, text)
  is 'Schedules paid downgrades for period end only. Paid upgrades require a confirmed PayMongo checkout before higher-tier entitlements activate.';

comment on function public.cancel_scheduled_subscription_plan_change(uuid, uuid)
  is 'Cancels a workspace-owner scheduled downgrade without changing the current paid plan.';

comment on function public.process_subscription_renewals()
  is 'Processes due cancellations/renewals and atomically applies scheduled period-end plan changes before renewal access is evaluated.';

comment on function public.begin_paymongo_checkout_creation(uuid, uuid, text, integer, text)
  is 'Creates a guarded PayMongo checkout lease. Active paid upgrades are allowed; active paid downgrades must use the scheduled period-end lifecycle.';

comment on function public.finalize_paymongo_checkout_creation(uuid, uuid, text, uuid, text, integer, text, timestamptz)
  is 'Finalizes PayMongo checkout creation while preserving the current paid plan/payment proof during an in-period upgrade until the new payment is confirmed.';

comment on function public.cancel_pending_paymongo_checkout(uuid, uuid)
  is 'Cancels both unpaid activation checkouts and in-period paid-plan upgrade checkouts without granting unpaid access or discarding a still-valid current paid period.';

comment on function public.expire_pending_paymongo_checkouts()
  is 'Expires pending activation or upgrade checkouts while preserving only concretely confirmed current paid access and any independently scheduled downgrade.';

notify pgrst, 'reload schema';

commit;
