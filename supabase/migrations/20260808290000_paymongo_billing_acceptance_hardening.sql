begin;

alter table public.billing_invoices
  drop constraint if exists billing_invoices_currency_paymongo_check;
alter table public.billing_invoices
  add constraint billing_invoices_currency_paymongo_check check (currency = 'PHP') not valid;

alter table public.usage_billing_statements
  drop constraint if exists usage_billing_statements_currency_paymongo_check;
alter table public.usage_billing_statements
  add constraint usage_billing_statements_currency_paymongo_check check (currency = 'PHP') not valid;

create index if not exists billing_invoices_org_status_created_idx
  on public.billing_invoices (organization_id, status, created_at desc);
create index if not exists usage_billing_statements_org_status_period_idx
  on public.usage_billing_statements (organization_id, status, period_start desc);
create index if not exists billing_payments_org_status_created_idx
  on public.billing_payments (organization_id, status, created_at desc);

create or replace function public.get_paymongo_billing_reconciliation(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_missing_invoices integer := 0;
  v_invoice_amount_mismatches integer := 0;
  v_orphan_invoices integer := 0;
  v_orphan_usage_statements integer := 0;
  v_duplicate_checkout_refs integer := 0;
  v_non_paymongo_payments integer := 0;
  v_non_php_records integer := 0;
  v_pending_expired integer := 0;
begin
  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id;

  select count(*) into v_missing_invoices
  from public.billing_payments p
  left join public.billing_invoices i on i.payment_id = p.id
  where p.organization_id = p_organization_id
    and p.status in ('paid','refunded','partially_refunded')
    and i.id is null;

  select count(*) into v_invoice_amount_mismatches
  from public.billing_invoices i
  join public.billing_payments p on p.id = i.payment_id
  where i.organization_id = p_organization_id
    and (
      i.currency <> p.currency
      or i.total <> coalesce(p.amount, 0)
      or (p.status = 'paid' and (i.status <> 'paid' or i.amount_paid <> coalesce(p.amount, 0) or i.amount_due <> 0))
      or (p.status in ('refunded','partially_refunded') and i.status not in ('refunded','paid'))
    );

  select count(*) into v_orphan_invoices
  from public.billing_invoices i
  left join public.billing_payments p on p.id = i.payment_id
  where i.organization_id = p_organization_id
    and i.payment_id is not null
    and p.id is null;

  select count(*) into v_orphan_usage_statements
  from public.usage_billing_statements s
  left join public.organization_subscriptions sub on sub.id = s.subscription_id
  where s.organization_id = p_organization_id
    and s.subscription_id is not null
    and sub.id is null;

  select count(*) into v_duplicate_checkout_refs
  from (
    select provider_checkout_id
    from public.billing_payments
    where organization_id = p_organization_id
      and provider = 'paymongo'
      and provider_checkout_id is not null
    group by provider_checkout_id
    having count(*) > 1
  ) duplicates;

  select count(*) into v_non_paymongo_payments
  from public.billing_payments
  where organization_id = p_organization_id
    and provider <> 'paymongo';

  select
    (select count(*) from public.billing_payments where organization_id = p_organization_id and currency <> 'PHP')
    + (select count(*) from public.billing_invoices where organization_id = p_organization_id and currency <> 'PHP')
    + (select count(*) from public.usage_billing_statements where organization_id = p_organization_id and currency <> 'PHP')
  into v_non_php_records;

  select count(*) into v_pending_expired
  from public.billing_payments
  where organization_id = p_organization_id
    and status = 'pending'
    and coalesce((metadata->>'expires_at')::timestamptz, created_at + interval '24 hours') < now();

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'subscriptionExists', v_subscription.id is not null,
    'subscriptionStatus', v_subscription.status,
    'billingProvider', v_subscription.billing_provider,
    'missingInvoices', v_missing_invoices,
    'invoiceAmountMismatches', v_invoice_amount_mismatches,
    'orphanInvoices', v_orphan_invoices,
    'orphanUsageStatements', v_orphan_usage_statements,
    'duplicateCheckoutReferences', v_duplicate_checkout_refs,
    'nonPayMongoPayments', v_non_paymongo_payments,
    'nonPhpRecords', v_non_php_records,
    'expiredPendingPayments', v_pending_expired,
    'healthy', (
      v_subscription.id is not null
      and v_subscription.billing_provider = 'paymongo'
      and v_missing_invoices = 0
      and v_invoice_amount_mismatches = 0
      and v_orphan_invoices = 0
      and v_orphan_usage_statements = 0
      and v_duplicate_checkout_refs = 0
      and v_non_paymongo_payments = 0
      and v_non_php_records = 0
      and v_pending_expired = 0
    ),
    'checkedAt', now()
  );
end;
$$;

revoke all on function public.get_paymongo_billing_reconciliation(uuid) from public, anon, authenticated;
grant execute on function public.get_paymongo_billing_reconciliation(uuid) to service_role;

comment on function public.get_paymongo_billing_reconciliation(uuid) is
  'Returns tenant-scoped PayMongo billing ledger and invoice reconciliation diagnostics.';

commit;
