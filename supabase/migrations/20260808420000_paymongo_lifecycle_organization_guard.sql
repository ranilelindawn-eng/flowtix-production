begin;

-- Allow PayMongo lifecycle events to be logged even when the webhook metadata
-- includes an organization_id that is not present in the tenancy table.
-- This prevents a foreign-key failure from rolling back the webhook event row.
-- It also preserves sanitized error text for test-mode failures without leaking
-- raw internal database messages in production.

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

    if p_amount is null or p_amount <> target_plan.monthly_price_cents then
      update public.billing_payment_events
      set status = 'ignored', ignored_reason = 'amount_mismatch',
          processed_at = now(), updated_at = now()
      where id = event_row.id;
      return jsonb_build_object('status', 'ignored', 'reason', 'amount_mismatch');
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
          'last_paid_at', event_occurred_at
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

revoke all on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) to service_role;

comment on function public.process_paymongo_lifecycle_event(
  text, text, boolean, timestamptz, text, text, uuid, text, text, text,
  integer, text, text, text, text, jsonb
) is 'Applies PayMongo lifecycle events and resolves payment.paid events against the locked pending checkout while preserving amount, currency, tenant, stale-event, refund, and idempotency protection.';

commit;
