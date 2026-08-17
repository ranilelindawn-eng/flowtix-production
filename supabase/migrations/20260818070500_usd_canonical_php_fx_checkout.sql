begin;

alter table public.subscription_plans
  add column if not exists paymongo_fx_rate numeric(18,8),
  add column if not exists paymongo_fx_rate_date date,
  add column if not exists paymongo_fx_provider text,
  add column if not exists paymongo_fx_updated_at timestamptz;

comment on column public.subscription_plans.monthly_price_cents is
  'Legacy/cached PayMongo PHP settlement amount. The canonical self-service list price is public_price_usd_cents; new checkout amounts are derived from the current USD/PHP reference quote.';
comment on column public.subscription_plans.paymongo_fx_rate is
  'Most recently quoted USD/PHP reference rate used to refresh the cached PayMongo settlement amount for self-service plans.';
comment on column public.subscription_plans.paymongo_fx_rate_date is
  'Reference-rate date associated with paymongo_fx_rate.';
comment on column public.subscription_plans.paymongo_fx_provider is
  'Reference-rate provider label associated with paymongo_fx_rate.';
comment on column public.subscription_plans.paymongo_fx_updated_at is
  'Timestamp when the cached PayMongo PHP amount was last refreshed from the canonical USD list price.';

create or replace function public.begin_paymongo_fx_checkout_creation(
  p_organization_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_amount integer,
  p_currency text,
  p_source_usd_cents integer,
  p_fx_rate numeric,
  p_fx_rate_date date,
  p_fx_provider text
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
  v_fx_provider text := nullif(trim(p_fx_provider), '');
  v_expected_amount integer;
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

  if v_plan.public_price_usd_cents is null or v_plan.public_price_usd_cents <= 0 then
    raise exception 'The selected plan does not have a valid USD list price.';
  end if;

  if p_source_usd_cents is distinct from v_plan.public_price_usd_cents then
    raise exception 'Checkout USD amount does not match the selected plan.';
  end if;

  if p_fx_rate is null or p_fx_rate < 20 or p_fx_rate > 100 then
    raise exception 'The USD to PHP reference rate is invalid.';
  end if;

  if p_fx_rate_date is null
     or p_fx_rate_date > current_date
     or p_fx_rate_date < current_date - 7 then
    raise exception 'The USD to PHP reference rate is stale or invalid.';
  end if;

  if v_fx_provider is null or length(v_fx_provider) > 120 then
    raise exception 'The USD to PHP reference rate provider is invalid.';
  end if;

  v_expected_amount := round(p_source_usd_cents::numeric * p_fx_rate)::integer;
  if v_expected_amount is distinct from p_amount then
    raise exception 'Checkout PHP amount does not match the USD conversion quote.';
  end if;

  update public.subscription_plans
  set monthly_price_cents = round(public_price_usd_cents::numeric * p_fx_rate)::integer,
      paymongo_fx_rate = p_fx_rate,
      paymongo_fx_rate_date = p_fx_rate_date,
      paymongo_fx_provider = v_fx_provider,
      paymongo_fx_updated_at = now(),
      updated_at = now()
  where code in ('starter', 'pro', 'business')
    and public_price_usd_cents is not null
    and public_price_usd_cents > 0
    and billing_provider = 'paymongo';

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
          'requested_plan_code', v_plan_code,
          'checkout_amount_centavos', p_amount,
          'checkout_currency', v_currency,
          'source_currency', 'USD',
          'source_amount_cents', p_source_usd_cents,
          'fx_rate', p_fx_rate,
          'fx_rate_date', p_fx_rate_date,
          'fx_provider', v_fx_provider
        ),
      updated_at = now()
  where id = v_subscription.id;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'creation_token', v_token,
    'plan_id', v_plan.id,
    'plan_code', v_plan.code,
    'amount_centavos', p_amount,
    'source_usd_cents', p_source_usd_cents,
    'fx_rate', p_fx_rate,
    'fx_rate_date', p_fx_rate_date,
    'fx_provider', v_fx_provider
  );
end;
$$;

create or replace function public.finalize_paymongo_fx_checkout_creation(
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
  v_reserved_amount integer;
  v_reserved_currency text;
  v_source_usd_cents integer;
  v_fx_rate numeric;
  v_fx_rate_date date;
  v_fx_provider text;
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

  v_reserved_amount := nullif(v_subscription.billing_metadata ->> 'checkout_amount_centavos', '')::integer;
  v_reserved_currency := upper(nullif(v_subscription.billing_metadata ->> 'checkout_currency', ''));
  v_source_usd_cents := nullif(v_subscription.billing_metadata ->> 'source_amount_cents', '')::integer;
  v_fx_rate := nullif(v_subscription.billing_metadata ->> 'fx_rate', '')::numeric;
  v_fx_rate_date := nullif(v_subscription.billing_metadata ->> 'fx_rate_date', '')::date;
  v_fx_provider := nullif(v_subscription.billing_metadata ->> 'fx_provider', '');

  if v_reserved_amount is null
     or v_reserved_amount is distinct from p_amount
     or v_reserved_currency is distinct from v_currency then
    raise exception 'The checkout settlement quote changed while checkout was being created.';
  end if;

  if v_source_usd_cents is distinct from v_plan.public_price_usd_cents
     or v_fx_rate is null
     or v_fx_rate_date is null
     or v_fx_provider is null
     or round(v_source_usd_cents::numeric * v_fx_rate)::integer is distinct from p_amount then
    raise exception 'The checkout USD to PHP conversion quote is invalid.';
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
      'preserved_past_due_grace', v_has_past_due_grace,
      'source_currency', 'USD',
      'source_amount_cents', v_source_usd_cents,
      'fx_rate', v_fx_rate,
      'fx_rate_date', v_fx_rate_date,
      'fx_provider', v_fx_provider,
      'settlement_currency', v_currency,
      'settlement_amount_centavos', p_amount
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
        'active_plan_code_during_checkout', v_current_plan_code,
        'checkout_amount_centavos', p_amount,
        'checkout_currency', v_currency,
        'source_currency', 'USD',
        'source_amount_cents', v_source_usd_cents,
        'fx_rate', v_fx_rate,
        'fx_rate_date', v_fx_rate_date,
        'fx_provider', v_fx_provider
      ),
      updated_at = now()
  where id = v_subscription.id;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'payment_id', v_payment_id,
    'checkout_id', v_checkout_id,
    'plan_code', v_plan_code,
    'preserved_active_paid_period', v_has_confirmed_paid_period,
    'preserved_past_due_grace', v_has_past_due_grace,
    'amount_centavos', p_amount,
    'source_usd_cents', v_source_usd_cents,
    'fx_rate', v_fx_rate,
    'fx_rate_date', v_fx_rate_date,
    'fx_provider', v_fx_provider
  );
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
  matched_payment public.billing_payments%rowtype;
  normalized_type text := lower(coalesce(nullif(trim(p_event_type), ''), 'unknown'));
  normalized_checkout_id text := nullif(trim(p_checkout_id), '');
  normalized_payment_id text := nullif(trim(p_payment_id), '');
  normalized_plan_code text := lower(nullif(trim(p_plan_code), ''));
  normalized_currency text := upper(nullif(trim(p_currency), ''));
  lifecycle_status text;
  old_status text;
  effective_organization_id uuid;
  event_occurred_at timestamptz := coalesce(p_signature_timestamp, now());
  raw_event_created_at text;
  affected_count integer := 0;
  sanitized_error text;
  error_context text;
begin
  if nullif(trim(p_event_id), '') is null then
    raise exception 'PayMongo event ID is required.';
  end if;

  if p_organization_id is not null then
    select id into effective_organization_id
    from public.organizations
    where id = p_organization_id
    limit 1;
  end if;

  raw_event_created_at := nullif(p_payload #>> '{data,attributes,created_at}', '');
  if raw_event_created_at is not null then
    begin
      if raw_event_created_at ~ '^[0-9]+([.][0-9]+)?$' then
        event_occurred_at := to_timestamp(raw_event_created_at::numeric);
      else
        event_occurred_at := raw_event_created_at::timestamptz;
      end if;
    exception when others then
      event_occurred_at := coalesce(p_signature_timestamp, now());
    end;
  end if;

  if event_occurred_at > now() + interval '5 minutes' then
    event_occurred_at := coalesce(p_signature_timestamp, now());
  end if;

  insert into public.billing_payment_events (
    provider, provider_event_id, event_type, livemode, signature_timestamp,
    provider_resource_type, provider_resource_id, organization_id,
    checkout_id, payment_id, plan_code, payload, status
  ) values (
    'paymongo', trim(p_event_id), coalesce(nullif(trim(p_event_type), ''), 'unknown'),
    p_livemode, p_signature_timestamp, nullif(trim(p_resource_type), ''),
    nullif(trim(p_resource_id), ''), effective_organization_id,
    normalized_checkout_id, normalized_payment_id,
    normalized_plan_code, coalesce(p_payload, '{}'::jsonb), 'received'
  )
  on conflict (provider, provider_event_id)
  do update set updated_at = now()
  returning * into event_row;

  if event_row.status = 'processed'
     or (
       event_row.status = 'ignored'
       and event_row.ignored_reason not in (
         'incomplete_paid_metadata',
         'missing_checkout_id'
       )
     ) then
    return jsonb_build_object(
      'status', event_row.status,
      'duplicate', true,
      'reason', event_row.ignored_reason
    );
  end if;

  if event_row.status = 'ignored' then
    update public.billing_payment_events
    set status = 'received', ignored_reason = null,
        processed_at = null, error_message = null, updated_at = now()
    where id = event_row.id;
  end if;

  if normalized_type like '%refund%' then
    lifecycle_status := case
      when lower(coalesce(p_payment_status, '')) like '%partial%' then 'partially_refunded'
      else 'refunded'
    end;
  elsif normalized_type like '%failed%'
     or lower(coalesce(p_payment_status, '')) = 'failed' then
    lifecycle_status := 'failed';
  elsif normalized_type like '%expired%' then
    lifecycle_status := 'expired';
  elsif normalized_type in ('checkout_session.payment.paid', 'payment.paid')
     or normalized_type like '%.paid'
     or lower(coalesce(p_payment_status, '')) = 'paid' then
    lifecycle_status := 'paid';
  else
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'unsupported_event_type',
        processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'duplicate', false, 'reason', 'unsupported_event_type');
  end if;

  if effective_organization_id is null then
    select payment.* into matched_payment
    from public.billing_payments payment
    where payment.provider = 'paymongo'
      and (
        (normalized_payment_id is not null and payment.provider_payment_id = normalized_payment_id)
        or (normalized_checkout_id is not null and payment.provider_checkout_id = normalized_checkout_id)
      )
    order by payment.created_at desc
    limit 1;

    if found then
      effective_organization_id := matched_payment.organization_id;
    end if;
  end if;

  if effective_organization_id is null then
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'missing_organization',
        processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'reason', 'missing_organization');
  end if;

  update public.billing_payment_events
  set organization_id = effective_organization_id,
      updated_at = now()
  where id = event_row.id;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = effective_organization_id
  for update;

  if not found then
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'subscription_not_found',
        processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'reason', 'subscription_not_found');
  end if;

  old_status := subscription_row.status;

  if subscription_row.last_billing_event_at is not null
     and event_occurred_at < subscription_row.last_billing_event_at
     and lifecycle_status not in ('refunded', 'partially_refunded') then
    update public.billing_payment_events
    set status = 'ignored', ignored_reason = 'stale_event',
        processed_at = now(), updated_at = now()
    where id = event_row.id;
    return jsonb_build_object('status', 'ignored', 'reason', 'stale_event');
  end if;

  if lifecycle_status = 'paid' then
    if normalized_payment_id is null
       or normalized_plan_code is null then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'incomplete_paid_metadata',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'incomplete_paid_metadata');
    end if;

    if normalized_checkout_id is null then
      normalized_checkout_id := coalesce(
        subscription_row.paymongo_checkout_id,
        subscription_row.provider_checkout_id
      );
    end if;

    if normalized_checkout_id is null then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'missing_checkout_id',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'missing_checkout_id');
    end if;

    update public.billing_payment_events
    set checkout_id = normalized_checkout_id,
        payment_id = normalized_payment_id,
        plan_code = normalized_plan_code,
        updated_at = now()
    where id = event_row.id;

    if subscription_row.paymongo_checkout_id is null
       or subscription_row.paymongo_checkout_id <> normalized_checkout_id then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'stale_checkout',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'stale_checkout');
    end if;

    select * into target_plan
    from public.subscription_plans
    where code = normalized_plan_code
      and billing_provider = 'paymongo'
      and is_active = true
      and is_public = true
    limit 1;

    if not found then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'plan_not_found',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'plan_not_found');
    end if;

    if subscription_row.pending_plan_id is distinct from target_plan.id then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'pending_plan_mismatch',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'pending_plan_mismatch');
    end if;

    if normalized_currency is distinct from 'PHP' then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'currency_mismatch',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'currency_mismatch');
    end if;

    select * into matched_payment
    from public.billing_payments payment
    where payment.organization_id = effective_organization_id
      and payment.provider = 'paymongo'
      and payment.provider_checkout_id = normalized_checkout_id
      and payment.status = 'pending'
    order by payment.created_at desc
    limit 1
    for update;

    if not found
       or matched_payment.plan_id is distinct from target_plan.id
       or matched_payment.amount is distinct from p_amount
       or upper(matched_payment.currency) is distinct from 'PHP' then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'pending_payment_mismatch',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'pending_payment_mismatch');
    end if;

    update public.billing_payments
    set provider_payment_id = normalized_payment_id,
        provider_event_id = trim(p_event_id),
        status = 'paid', paid_at = coalesce(paid_at, event_occurred_at),
        updated_at = now()
    where id = matched_payment.id;

    update public.organization_subscriptions
    set plan_id = target_plan.id,
        pending_plan_id = null,
        status = 'active',
        billing_provider = 'paymongo',
        paymongo_checkout_id = normalized_checkout_id,
        paymongo_plan_code = normalized_plan_code,
        paymongo_payment_id = normalized_payment_id,
        provider_checkout_id = normalized_checkout_id,
        provider_payment_id = normalized_payment_id,
        current_period_start = event_occurred_at,
        current_period_end = event_occurred_at + interval '1 month',
        pending_checkout_expires_at = null,
        cancel_at_period_end = false,
        activated_at = coalesce(activated_at, event_occurred_at),
        cancelled_at = null,
        grace_period_ends_at = null,
        payment_failure_count = 0,
        last_payment_status = 'paid',
        last_billing_event_at = event_occurred_at,
        billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
          'last_event_id', trim(p_event_id),
          'last_event_type', p_event_type,
          'livemode', p_livemode,
          'last_paid_at', event_occurred_at,
          'last_paid_checkout_pricing', coalesce(matched_payment.metadata, '{}'::jsonb)
        ),
        updated_at = now()
    where id = subscription_row.id;

  elsif lifecycle_status = 'failed' then
    if normalized_payment_id is not null or normalized_checkout_id is not null then
      select * into matched_payment
      from public.billing_payments payment
      where payment.organization_id = effective_organization_id
        and payment.provider = 'paymongo'
        and (
          (normalized_payment_id is not null and payment.provider_payment_id = normalized_payment_id)
          or (normalized_checkout_id is not null and payment.provider_checkout_id = normalized_checkout_id)
        )
      order by payment.created_at desc
      limit 1
      for update;
    end if;

    if found then
      update public.billing_payments
      set status = 'failed', provider_event_id = trim(p_event_id),
          failure_code = nullif(trim(p_failure_code), ''),
          failure_message = left(nullif(trim(p_failure_message), ''), 1000),
          updated_at = now()
      where id = matched_payment.id;
    end if;

    update public.organization_subscriptions
    set status = case
          when current_period_end is not null and current_period_end > now() then status
          when plan_id is not null then 'past_due'
          else 'inactive'
        end,
        payment_failure_count = payment_failure_count + 1,
        grace_period_ends_at = case
          when plan_id is not null then coalesce(grace_period_ends_at, now() + interval '7 days')
          else null
        end,
        last_payment_status = 'failed',
        last_billing_event_at = event_occurred_at,
        updated_at = now()
    where id = subscription_row.id;

  elsif lifecycle_status in ('refunded', 'partially_refunded') then
    update public.billing_payments
    set status = lifecycle_status,
        refunded_at = event_occurred_at,
        provider_event_id = trim(p_event_id),
        updated_at = now()
    where organization_id = effective_organization_id
      and provider = 'paymongo'
      and (
        (normalized_payment_id is not null and provider_payment_id = normalized_payment_id)
        or (normalized_checkout_id is not null and provider_checkout_id = normalized_checkout_id)
      );

    get diagnostics affected_count = row_count;
    if affected_count = 0 then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'payment_not_found',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'payment_not_found');
    end if;

    update public.organization_subscriptions
    set status = case when lifecycle_status = 'refunded' then 'cancelled' else status end,
        cancelled_at = case when lifecycle_status = 'refunded' then event_occurred_at else cancelled_at end,
        cancel_at_period_end = false,
        last_payment_status = lifecycle_status,
        last_billing_event_at = greatest(coalesce(last_billing_event_at, event_occurred_at), event_occurred_at),
        updated_at = now()
    where id = subscription_row.id;

  elsif lifecycle_status = 'expired' then
    if normalized_checkout_id is null then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'missing_checkout_id',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'missing_checkout_id');
    end if;

    update public.billing_payments
    set status = 'expired', provider_event_id = trim(p_event_id), updated_at = now()
    where organization_id = effective_organization_id
      and provider = 'paymongo'
      and provider_checkout_id = normalized_checkout_id
      and status = 'pending';

    if subscription_row.paymongo_checkout_id = normalized_checkout_id then
      update public.organization_subscriptions
      set status = case when plan_id is not null then 'active' else 'inactive' end,
          pending_plan_id = null,
          pending_checkout_expires_at = null,
          paymongo_checkout_id = null,
          paymongo_plan_code = null,
          provider_checkout_id = null,
          last_payment_status = 'expired',
          last_billing_event_at = event_occurred_at,
          updated_at = now()
      where id = subscription_row.id;
    end if;
  end if;

  insert into public.subscription_lifecycle_events (
    organization_id, subscription_id, event_type, source,
    previous_status, new_status, plan_id, provider_event_id, metadata
  ) values (
    effective_organization_id, subscription_row.id, 'payment_' || lifecycle_status,
    'paymongo_webhook', old_status,
    case
      when lifecycle_status = 'paid' then 'active'
      when lifecycle_status = 'refunded' then 'cancelled'
      when lifecycle_status = 'failed' and subscription_row.plan_id is not null then 'past_due'
      else old_status
    end,
    coalesce(target_plan.id, subscription_row.plan_id), trim(p_event_id),
    jsonb_build_object(
      'checkout_id', normalized_checkout_id,
      'payment_id', normalized_payment_id,
      'amount', p_amount,
      'currency', normalized_currency,
      'event_occurred_at', event_occurred_at
    )
  ) on conflict (provider_event_id, event_type)
      where provider_event_id is not null do nothing;

  update public.billing_payment_events
  set organization_id = effective_organization_id,
      status = 'processed', processed_at = now(), error_message = null,
      updated_at = now()
  where id = event_row.id;

  return jsonb_build_object(
    'status', 'processed',
    'duplicate', false,
    'lifecycle_status', lifecycle_status,
    'organization_id', effective_organization_id,
    'subscription_id', subscription_row.id
  );
exception
  when others then
    get stacked diagnostics
      error_context = pg_exception_context;

    sanitized_error := left(
      regexp_replace(
        concat(
          'SQLSTATE=', sqlstate,
          '; MESSAGE=', sqlerrm,
          '; CONTEXT=', coalesce(error_context, 'unknown')
        ),
        E'[\n\r\t]+',
        ' ',
        'g'
      ),
      4000
    );

    update public.billing_payment_events
    set status = 'failed',
        error_message = sanitized_error,
        updated_at = now()
    where provider = 'paymongo'
      and provider_event_id = trim(p_event_id);

    return jsonb_build_object(
      'status', 'failed',
      'reason', 'processing_error',
      'error', case
        when p_livemode = false then sanitized_error
        else null
      end
    );
end;
$$;

revoke all on function public.begin_paymongo_fx_checkout_creation(
  uuid, uuid, text, integer, text, integer, numeric, date, text
) from public, anon, authenticated;
revoke all on function public.finalize_paymongo_fx_checkout_creation(
  uuid, uuid, text, uuid, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.begin_paymongo_fx_checkout_creation(
  uuid, uuid, text, integer, text, integer, numeric, date, text
) to service_role;
grant execute on function public.finalize_paymongo_fx_checkout_creation(
  uuid, uuid, text, uuid, text, integer, text, timestamptz
) to service_role;
revoke all on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) to service_role;

comment on function public.begin_paymongo_fx_checkout_creation(
  uuid, uuid, text, integer, text, integer, numeric, date, text
) is
  'Reserves a standard Flowtix PayMongo checkout using canonical USD plan pricing plus a validated USD/PHP reference-rate snapshot. Enterprise remains assisted and negotiated separately.';
comment on function public.finalize_paymongo_fx_checkout_creation(
  uuid, uuid, text, uuid, text, integer, text, timestamptz
) is
  'Finalizes a standard Flowtix PayMongo checkout against the exact USD/PHP quote reserved at checkout creation and stores the FX snapshot with the pending billing payment.';
comment on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) is
  'Processes organization-scoped PayMongo lifecycle events. Paid amount validation is bound to the exact pending billing payment/checkout amount so later FX-rate changes cannot invalidate an earlier checkout.';

commit;
