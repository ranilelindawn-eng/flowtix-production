begin;

alter table public.organization_subscriptions
  add column if not exists checkout_creation_token uuid,
  add column if not exists checkout_creation_started_at timestamptz;

create index if not exists organization_subscriptions_checkout_creation_idx
  on public.organization_subscriptions (checkout_creation_started_at)
  where checkout_creation_token is not null;

with ranked_checkout_rows as (
  select id, provider_checkout_id,
         row_number() over (
           partition by provider, provider_checkout_id
           order by case status when 'paid' then 0 when 'pending' then 1 else 2 end,
                    created_at asc, id asc
         ) as duplicate_rank
  from public.billing_payments
  where provider = 'paymongo' and provider_checkout_id is not null
)
update public.billing_payments payment
set metadata = coalesce(payment.metadata, '{}'::jsonb) ||
      jsonb_build_object('duplicate_provider_checkout_id', payment.provider_checkout_id),
    provider_checkout_id = null,
    updated_at = now()
from ranked_checkout_rows ranked
where ranked.id = payment.id and ranked.duplicate_rank > 1;

create unique index if not exists billing_payments_paymongo_checkout_unique
  on public.billing_payments (provider, provider_checkout_id)
  where provider = 'paymongo' and provider_checkout_id is not null;

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
  v_token uuid := gen_random_uuid();
  v_plan_code text := lower(nullif(trim(p_plan_code), ''));
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'PHP'));
begin
  if p_organization_id is null then raise exception 'Organization is required.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'A positive checkout amount is required.'; end if;
  if v_currency <> 'PHP' then raise exception 'Flowtix PayMongo checkout currency must be PHP.'; end if;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id
    and code = v_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and coalesce(is_public, true) = true
  for share;

  if not found then raise exception 'The selected PayMongo plan is unavailable.'; end if;
  if v_plan.monthly_price_cents is distinct from p_amount then
    raise exception 'Checkout amount does not match the selected plan.';
  end if;

  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then raise exception 'Subscription record was not found.'; end if;

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

  update public.organization_subscriptions
  set checkout_creation_token = v_token,
      checkout_creation_started_at = now(),
      pending_plan_id = v_plan.id,
      billing_provider = 'paymongo',
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
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
  v_checkout_id text := nullif(trim(p_checkout_id), '');
  v_plan_code text := lower(nullif(trim(p_plan_code), ''));
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'PHP'));
  v_payment_id uuid;
begin
  if p_creation_token is null then raise exception 'Checkout creation token is required.'; end if;
  if v_checkout_id is null or length(v_checkout_id) > 255 then raise exception 'A valid PayMongo checkout ID is required.'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Checkout expiration must be in the future.'; end if;
  if v_currency <> 'PHP' then raise exception 'Flowtix PayMongo checkout currency must be PHP.'; end if;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id
    and code = v_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and coalesce(is_public, true) = true
  for share;

  if not found then raise exception 'The selected PayMongo plan is unavailable.'; end if;
  if v_plan.monthly_price_cents is distinct from p_amount then raise exception 'Checkout amount does not match the selected plan.'; end if;

  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then raise exception 'Subscription record was not found.'; end if;
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

  insert into public.billing_payments (
    organization_id, subscription_id, provider, provider_checkout_id,
    plan_id, plan_code, status, amount, currency, metadata
  ) values (
    p_organization_id, v_subscription.id, 'paymongo', v_checkout_id,
    v_plan.id, v_plan_code, 'pending', p_amount, v_currency,
    jsonb_build_object('checkout_expires_at', p_expires_at, 'creation_token', p_creation_token)
  )
  on conflict (provider, provider_checkout_id) where provider = 'paymongo' and provider_checkout_id is not null
  do update set
    subscription_id = excluded.subscription_id,
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    amount = excluded.amount,
    currency = excluded.currency,
    status = case when billing_payments.status = 'paid' then billing_payments.status else 'pending' end,
    metadata = billing_payments.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_payment_id;

  update public.organization_subscriptions
  set status = case
        when plan_id is not null and current_period_end is not null and current_period_end > now()
          then status
        else 'pending'
      end,
      paymongo_checkout_id = v_checkout_id,
      paymongo_plan_code = v_plan_code,
      paymongo_payment_id = null,
      provider_checkout_id = v_checkout_id,
      provider_payment_id = null,
      pending_plan_id = v_plan.id,
      pending_checkout_expires_at = p_expires_at,
      last_payment_status = 'pending',
      checkout_creation_token = null,
      checkout_creation_started_at = null,
      billing_metadata = (coalesce(billing_metadata, '{}'::jsonb)
        - 'checkout_creation_started_at') || jsonb_build_object(
          'checkout_created_at', now(),
          'requested_plan_code', v_plan_code,
          'checkout_expires_at', p_expires_at
        ),
      updated_at = now()
  where id = v_subscription.id;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'payment_id', v_payment_id,
    'checkout_id', v_checkout_id,
    'plan_code', v_plan_code
  );
end;
$$;

create or replace function public.abandon_paymongo_checkout_creation(
  p_organization_id uuid,
  p_creation_token uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.organization_subscriptions
  set checkout_creation_token = null,
      checkout_creation_started_at = null,
      pending_plan_id = case when paymongo_checkout_id is null then null else pending_plan_id end,
      billing_metadata = (coalesce(billing_metadata, '{}'::jsonb)
        - 'checkout_creation_started_at') || jsonb_build_object(
          'checkout_creation_abandoned_at', now(),
          'checkout_creation_failure', left(coalesce(nullif(trim(p_reason), ''), 'unknown'), 500)
        ),
      updated_at = now()
  where organization_id = p_organization_id
    and checkout_creation_token = p_creation_token;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
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
    returning subscription.id, subscription.organization_id, subscription.plan_id,
              subscription.paymongo_checkout_id as expired_checkout_id,
              subscription.status as new_status
  ), payments as (
    update public.billing_payments payment
    set status = 'expired', updated_at = now()
    from expired
    where payment.subscription_id = expired.id
      and payment.provider = 'paymongo'
      and payment.provider_checkout_id = expired.expired_checkout_id
      and payment.status = 'pending'
    returning payment.id
  ), events as (
    insert into public.subscription_lifecycle_events (
      organization_id, subscription_id, event_type, source,
      previous_status, new_status, plan_id, metadata
    )
    select expired.organization_id, expired.id, 'checkout_expired', 'system',
           'pending', expired.new_status, expired.plan_id,
           jsonb_build_object('checkout_id', expired.expired_checkout_id, 'expired_at', now())
    from expired
    returning 1
  )
  select count(*) into v_affected from events;

  update public.organization_subscriptions
  set checkout_creation_token = null,
      checkout_creation_started_at = null,
      pending_plan_id = case when paymongo_checkout_id is null then null else pending_plan_id end,
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
     and new.plan_id = old.scheduled_plan_id
     and new.status = 'active' then
    new.scheduled_plan_id := null;
    new.scheduled_plan_effective_at := null;
    new.billing_metadata := coalesce(new.billing_metadata, '{}'::jsonb) || jsonb_build_object(
      'scheduled_plan_activated_at', now(),
      'scheduled_plan_previous_id', old.plan_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists organization_subscriptions_clear_activated_scheduled_plan on public.organization_subscriptions;
create trigger organization_subscriptions_clear_activated_scheduled_plan
before update of plan_id, status on public.organization_subscriptions
for each row execute function public.clear_activated_scheduled_plan();

create or replace function public.generate_invoice_for_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.billing_payments%rowtype;
  s public.organization_subscriptions%rowtype;
  v_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  select * into p from public.billing_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  select * into s from public.organization_subscriptions where id = p.subscription_id;

  v_period_start := case when p.status = 'paid' then coalesce(p.paid_at, now()) else s.current_period_start end;
  v_period_end := case when p.status = 'paid' then v_period_start + interval '1 month' else s.current_period_end end;

  insert into public.billing_invoices(
    organization_id, subscription_id, payment_id, status, currency,
    subtotal, total, amount_paid, amount_due, period_start, period_end,
    paid_at, line_items, metadata
  ) values (
    p.organization_id, p.subscription_id, p.id,
    case when p.status = 'paid' then 'paid' else 'open' end,
    p.currency, coalesce(p.amount, 0), coalesce(p.amount, 0),
    case when p.status = 'paid' then coalesce(p.amount, 0) else 0 end,
    case when p.status = 'paid' then 0 else coalesce(p.amount, 0) end,
    v_period_start, v_period_end, p.paid_at,
    jsonb_build_array(jsonb_build_object(
      'description', coalesce(p.plan_code, 'Flowtix subscription'),
      'quantity', 1, 'unit_amount', coalesce(p.amount, 0), 'amount', coalesce(p.amount, 0)
    )),
    jsonb_build_object('provider', p.provider, 'provider_payment_id', p.provider_payment_id)
  )
  on conflict(payment_id) do update set
    status = excluded.status,
    currency = excluded.currency,
    subtotal = excluded.subtotal,
    total = excluded.total,
    amount_paid = excluded.amount_paid,
    amount_due = excluded.amount_due,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    paid_at = excluded.paid_at,
    line_items = excluded.line_items,
    metadata = billing_invoices.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.maintain_paymongo_billing_runtime()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired integer := 0;
  v_renewals integer := 0;
begin
  v_expired := public.expire_pending_paymongo_checkouts();
  v_renewals := public.process_subscription_renewals();
  return jsonb_build_object(
    'expired_checkouts', v_expired,
    'processed_renewals', v_renewals,
    'processed_at', now()
  );
end;
$$;

revoke all on function public.begin_paymongo_checkout_creation(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.finalize_paymongo_checkout_creation(uuid, uuid, text, uuid, text, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.abandon_paymongo_checkout_creation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.maintain_paymongo_billing_runtime() from public, anon, authenticated;
grant execute on function public.begin_paymongo_checkout_creation(uuid, uuid, text, integer, text) to service_role;
grant execute on function public.finalize_paymongo_checkout_creation(uuid, uuid, text, uuid, text, integer, text, timestamptz) to service_role;
grant execute on function public.abandon_paymongo_checkout_creation(uuid, uuid, text) to service_role;
grant execute on function public.maintain_paymongo_billing_runtime() to service_role;

comment on function public.maintain_paymongo_billing_runtime() is
  'Expires only the matching PayMongo checkout ledger rows, releases stale checkout creation leases, and processes due subscription lifecycle transitions.';

commit;
