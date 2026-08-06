begin;

create or replace function public.register_pending_paymongo_checkout(
  p_organization_id uuid,
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
  subscription_row public.organization_subscriptions%rowtype;
  plan_row public.subscription_plans%rowtype;
  normalized_checkout_id text := nullif(trim(p_checkout_id), '');
  normalized_plan_code text := lower(nullif(trim(p_plan_code), ''));
  normalized_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'PHP'));
  payment_id uuid;
begin
  if p_organization_id is null then
    raise exception 'Organization is required.';
  end if;
  if normalized_checkout_id is null or length(normalized_checkout_id) > 255 then
    raise exception 'A valid PayMongo checkout ID is required.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A positive checkout amount is required.';
  end if;
  if normalized_currency <> 'PHP' then
    raise exception 'Flowtix PayMongo checkout currency must be PHP.';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Checkout expiration must be in the future.';
  end if;

  select * into plan_row
  from public.subscription_plans
  where id = p_plan_id
    and code = normalized_plan_code
    and billing_provider = 'paymongo'
    and is_active = true
    and is_public = true
  for share;

  if not found then
    raise exception 'The selected PayMongo plan is unavailable.';
  end if;
  if plan_row.monthly_price_cents is distinct from p_amount then
    raise exception 'Checkout amount does not match the selected plan.';
  end if;

  select * into subscription_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Subscription record was not found.';
  end if;

  update public.organization_subscriptions
  set billing_provider = 'paymongo',
      paymongo_checkout_id = normalized_checkout_id,
      paymongo_plan_code = normalized_plan_code,
      paymongo_payment_id = null,
      provider_checkout_id = normalized_checkout_id,
      provider_payment_id = null,
      pending_plan_id = plan_row.id,
      pending_checkout_expires_at = p_expires_at,
      last_payment_status = 'pending',
      status = 'pending',
      billing_metadata = coalesce(billing_metadata, '{}'::jsonb) || jsonb_build_object(
        'checkout_created_at', now(),
        'requested_plan_code', normalized_plan_code,
        'checkout_expires_at', p_expires_at
      ),
      updated_at = now()
  where id = subscription_row.id;

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
  ) values (
    p_organization_id,
    subscription_row.id,
    'paymongo',
    normalized_checkout_id,
    plan_row.id,
    normalized_plan_code,
    'pending',
    p_amount,
    normalized_currency,
    jsonb_build_object('checkout_expires_at', p_expires_at)
  )
  returning id into payment_id;

  return jsonb_build_object(
    'subscription_id', subscription_row.id,
    'payment_id', payment_id,
    'checkout_id', normalized_checkout_id,
    'plan_code', normalized_plan_code
  );
end;
$$;

revoke all on function public.register_pending_paymongo_checkout(
  uuid, text, uuid, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.register_pending_paymongo_checkout(
  uuid, text, uuid, text, integer, text, timestamptz
) to service_role;

comment on function public.register_pending_paymongo_checkout(
  uuid, text, uuid, text, integer, text, timestamptz
) is 'Atomically registers a server-created PayMongo checkout and its pending payment ledger row.';

commit;
