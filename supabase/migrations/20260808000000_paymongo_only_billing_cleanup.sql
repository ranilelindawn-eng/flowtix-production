begin;

create table if not exists public.billing_legacy_archive (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text,
  payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now()
);

alter table public.billing_legacy_archive enable row level security;
revoke all on public.billing_legacy_archive from anon, authenticated;
grant all on public.billing_legacy_archive to service_role;

-- Preserve any historical non-PayMongo provider rows before removing them.
insert into public.billing_legacy_archive (source_table, source_id, payload)
select 'billing_payment_events', id::text, to_jsonb(event)
from public.billing_payment_events as event
where event.provider <> 'paymongo'
on conflict do nothing;

delete from public.billing_payment_events
where provider <> 'paymongo';

do $$
begin
  if to_regclass('public.billing_payments') is not null then
    execute $sql$
      insert into public.billing_legacy_archive (
        source_table,
        source_id,
        payload
      )
      select 'billing_payments', id::text, to_jsonb(payment)
      from public.billing_payments as payment
      where payment.provider <> 'paymongo'
    $sql$;

    execute $sql$
      delete from public.billing_payments
      where provider <> 'paymongo'
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.subscription_events') is not null then
    execute $sql$
      insert into public.billing_legacy_archive (
        source_table,
        source_id,
        payload
      )
      select 'subscription_events', id::text, to_jsonb(event)
      from public.subscription_events as event
    $sql$;

    execute 'drop table public.subscription_events';
  end if;
end
$$;

update public.subscription_plans
set
  billing_provider = 'paymongo',
  provider_price_code = coalesce(
    nullif(provider_price_code, ''),
    nullif(paymongo_price_code, ''),
    code
  ),
  monthly_price_cents = case code
    when 'starter' then 170000
    when 'pro' then 460000
    when 'business' then 1150000
    when 'enterprise' then 2900000
    else monthly_price_cents
  end,
  updated_at = now();

update public.organization_subscriptions
set billing_provider = 'paymongo', updated_at = now();

alter table public.subscription_plans
  drop constraint if exists subscription_plans_billing_provider_check;
alter table public.subscription_plans
  add constraint subscription_plans_billing_provider_check
  check (billing_provider = 'paymongo');

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_billing_provider_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_billing_provider_check
  check (billing_provider = 'paymongo');

alter table public.billing_payment_events
  drop constraint if exists billing_payment_events_provider_check;
alter table public.billing_payment_events
  add constraint billing_payment_events_provider_check
  check (provider = 'paymongo');

do $$
begin
  if to_regclass('public.billing_payments') is not null then
    execute 'alter table public.billing_payments drop constraint if exists billing_payments_provider_check';
    execute 'alter table public.billing_payments add constraint billing_payments_provider_check check (provider = ''paymongo'')';
  end if;
end
$$;

alter table public.subscription_plans
  drop column if exists stripe_price_id;

alter table public.organization_subscriptions
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

comment on table public.billing_legacy_archive is
  'Restricted archive created while retiring the former billing provider. Active Flowtix billing is PayMongo-only.';

commit;
