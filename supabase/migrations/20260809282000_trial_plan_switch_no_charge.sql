begin;

-- Flowtix active-trial plan switching.
--
-- During an unexpired free trial, changing plans must not create a PayMongo
-- Checkout Session or charge the subscriber. The selected plan changes
-- immediately while the original trial_started_at and trial_ends_at remain
-- unchanged.

create or replace function public.switch_flowtix_trial_plan_if_active(
  p_organization_id uuid,
  p_plan_id uuid,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_plan_code text := lower(nullif(trim(p_plan_code), ''));
  v_previous_plan_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_organization_id is null or p_plan_id is null or v_plan_code is null then
    raise exception 'Organization and plan are required.';
  end if;

  if v_plan_code = 'professional' then
    v_plan_code := 'pro';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = p_plan_id
    and code = v_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and coalesce(is_public, true) = true
  limit 1;

  if not found then
    raise exception 'The selected Flowtix plan is unavailable.';
  end if;

  select *
  into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription record was not found.';
  end if;

  -- Returning applied=false is intentional: the API route will continue into
  -- the existing PayMongo checkout path for paid, expired, pending, or other
  -- non-trial subscriptions.
  if v_subscription.status <> 'trialing'
     or v_subscription.trial_started_at is null
     or v_subscription.trial_ends_at is null
     or v_subscription.trial_ends_at <= now() then
    return jsonb_build_object(
      'applied', false,
      'changed', false,
      'reason', 'trial_not_active',
      'subscription_id', v_subscription.id
    );
  end if;

  -- An active free trial must never carry an active PayMongo checkout.
  if v_subscription.pending_plan_id is not null
     or v_subscription.provider_checkout_id is not null
     or v_subscription.paymongo_checkout_id is not null
     or v_subscription.last_payment_status <> 'trialing' then
    raise exception 'The active trial has an unexpected billing state.';
  end if;

  if v_subscription.plan_id = v_plan.id then
    return jsonb_build_object(
      'applied', true,
      'changed', false,
      'subscription_id', v_subscription.id,
      'plan_id', v_plan.id,
      'plan_code', v_plan.code,
      'trial_ends_at', v_subscription.trial_ends_at
    );
  end if;

  v_previous_plan_id := v_subscription.plan_id;

  update public.organization_subscriptions
  set
    plan_id = v_plan.id,
    paymongo_plan_code = v_plan.code,
    billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'trial_plan_code', v_plan.code,
        'trial_plan_changed_at', now(),
        'trial_charge_due_today', 0
      ),
    updated_at = now()
  where id = v_subscription.id;

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
    p_organization_id,
    v_subscription.id,
    'trial_plan_changed',
    'system',
    'trialing',
    'trialing',
    v_plan.id,
    jsonb_build_object(
      'previous_plan_id', v_previous_plan_id,
      'new_plan_id', v_plan.id,
      'new_plan_code', v_plan.code,
      'trial_started_at', v_subscription.trial_started_at,
      'trial_ends_at', v_subscription.trial_ends_at,
      'charged', false
    )
  );

  return jsonb_build_object(
    'applied', true,
    'changed', true,
    'subscription_id', v_subscription.id,
    'plan_id', v_plan.id,
    'plan_code', v_plan.code,
    'trial_ends_at', v_subscription.trial_ends_at
  );
end;
$$;

revoke all on function public.switch_flowtix_trial_plan_if_active(uuid,uuid,text)
  from public, anon, authenticated;

grant execute on function public.switch_flowtix_trial_plan_if_active(uuid,uuid,text)
  to service_role;

notify pgrst, 'reload schema';

commit;
