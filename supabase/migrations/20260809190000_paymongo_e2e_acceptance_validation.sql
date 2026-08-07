-- Flowtix Phase 2.4 — PayMongo End-to-End Acceptance Validation
--
-- Read-only Platform validation over the existing PayMongo lifecycle.
-- This migration does NOT activate subscriptions, create payments, create
-- invoices, replay webhooks, or modify PayMongo state.

begin;

create or replace function public.platform_paymongo_acceptance_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  subscription_total bigint;
  subscription_active bigint;
  subscription_pending bigint;
  subscription_past_due bigint;
  non_paymongo_subscriptions bigint;
  expired_pending_checkouts bigint;
  pending_without_checkout bigint;

  payment_total bigint;
  payment_paid bigint;
  payment_failed bigint;
  payment_pending bigint;
  paid_missing_invoice bigint;
  invoice_amount_mismatches bigint;

  webhook_total bigint;
  webhook_processed bigint;
  webhook_failed bigint;
  webhook_ignored bigint;
  webhook_dead_lettered bigint;
  webhook_processed_24h bigint;
  paid_events_without_payment bigint;

  invoice_total bigint;
  invoice_paid bigint;
  invoice_open bigint;

  usage_open bigint;
  usage_finalized bigint;
  usage_invoiced bigint;

  lifecycle_total bigint;
  lifecycle_24h bigint;

  critical_count bigint;
  warning_count bigint;
  score_value integer;
  issue_list jsonb := '[]'::jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (where subscription.status = 'active'),
    count(*) filter (where subscription.status = 'pending'),
    count(*) filter (where subscription.status = 'past_due'),
    count(*) filter (
      where coalesce(subscription.billing_provider, 'paymongo') <> 'paymongo'
    ),
    count(*) filter (
      where subscription.status = 'pending'
        and subscription.pending_checkout_expires_at is not null
        and subscription.pending_checkout_expires_at <= pg_catalog.now()
    ),
    count(*) filter (
      where subscription.status = 'pending'
        and coalesce(
          nullif(subscription.provider_checkout_id, ''),
          nullif(subscription.paymongo_checkout_id, '')
        ) is null
        and subscription.checkout_creation_token is null
    )
  into
    subscription_total,
    subscription_active,
    subscription_pending,
    subscription_past_due,
    non_paymongo_subscriptions,
    expired_pending_checkouts,
    pending_without_checkout
  from public.organization_subscriptions subscription;

  select
    count(*),
    count(*) filter (where payment.status = 'paid'),
    count(*) filter (where payment.status = 'failed'),
    count(*) filter (where payment.status = 'pending')
  into
    payment_total,
    payment_paid,
    payment_failed,
    payment_pending
  from public.billing_payments payment
  where payment.provider = 'paymongo';

  select count(*)
  into paid_missing_invoice
  from public.billing_payments payment
  left join public.billing_invoices invoice
    on invoice.payment_id = payment.id
  where payment.provider = 'paymongo'
    and payment.status = 'paid'
    and invoice.id is null;

  select count(*)
  into invoice_amount_mismatches
  from public.billing_payments payment
  join public.billing_invoices invoice
    on invoice.payment_id = payment.id
  where payment.provider = 'paymongo'
    and payment.status = 'paid'
    and (
      invoice.status <> 'paid'
      or invoice.amount_paid <> coalesce(payment.amount, 0)
      or invoice.amount_due <> 0
      or invoice.total <> coalesce(payment.amount, 0)
      or invoice.currency <> payment.currency
    );

  select
    count(*),
    count(*) filter (where event.status = 'processed'),
    count(*) filter (where event.status = 'failed'),
    count(*) filter (where event.status = 'ignored'),
    count(*) filter (where event.dead_lettered_at is not null),
    count(*) filter (
      where event.status = 'processed'
        and event.processed_at >= pg_catalog.now() - interval '24 hours'
    )
  into
    webhook_total,
    webhook_processed,
    webhook_failed,
    webhook_ignored,
    webhook_dead_lettered,
    webhook_processed_24h
  from public.billing_payment_events event
  where event.provider = 'paymongo';

  select count(*)
  into paid_events_without_payment
  from public.billing_payment_events event
  where event.provider = 'paymongo'
    and event.status = 'processed'
    and event.event_type in (
      'checkout_session.payment.paid',
      'payment.paid'
    )
    and not exists (
      select 1
      from public.billing_payments payment
      where payment.provider = 'paymongo'
        and (
          (
            event.payment_id is not null
            and payment.provider_payment_id = event.payment_id
          )
          or (
            event.checkout_id is not null
            and payment.provider_checkout_id = event.checkout_id
          )
          or (
            payment.provider_event_id = event.provider_event_id
          )
        )
        and payment.status = 'paid'
    );

  select
    count(*),
    count(*) filter (where invoice.status = 'paid'),
    count(*) filter (where invoice.status = 'open')
  into
    invoice_total,
    invoice_paid,
    invoice_open
  from public.billing_invoices invoice;

  select
    count(*) filter (where statement.status = 'open'),
    count(*) filter (where statement.status = 'finalized'),
    count(*) filter (where statement.status = 'invoiced')
  into
    usage_open,
    usage_finalized,
    usage_invoiced
  from public.usage_billing_statements statement;

  select
    count(*),
    count(*) filter (
      where lifecycle.created_at >= pg_catalog.now() - interval '24 hours'
    )
  into
    lifecycle_total,
    lifecycle_24h
  from public.subscription_lifecycle_events lifecycle;

  if non_paymongo_subscriptions > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'non_paymongo_subscriptions',
        'severity', 'critical',
        'count', non_paymongo_subscriptions,
        'message', 'Active subscription rows are not marked as PayMongo billing.'
      )
    );
  end if;

  if paid_missing_invoice > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'paid_payments_missing_invoice',
        'severity', 'critical',
        'count', paid_missing_invoice,
        'message', 'Paid PayMongo payment ledger rows are missing invoices.'
      )
    );
  end if;

  if invoice_amount_mismatches > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'invoice_amount_mismatch',
        'severity', 'critical',
        'count', invoice_amount_mismatches,
        'message', 'Paid invoice totals do not match their PayMongo payment ledger.'
      )
    );
  end if;

  if paid_events_without_payment > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'paid_webhook_without_payment',
        'severity', 'critical',
        'count', paid_events_without_payment,
        'message', 'Processed paid PayMongo webhook events are missing a paid payment ledger row.'
      )
    );
  end if;

  if pending_without_checkout > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'pending_subscription_without_checkout',
        'severity', 'warning',
        'count', pending_without_checkout,
        'message', 'Pending subscriptions exist without an active checkout or checkout-creation lease.'
      )
    );
  end if;

  if expired_pending_checkouts > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'expired_pending_checkout',
        'severity', 'warning',
        'count', expired_pending_checkouts,
        'message', 'Expired pending PayMongo checkouts still require the normal maintenance cleanup.'
      )
    );
  end if;

  if webhook_dead_lettered > 0 then
    issue_list := issue_list || jsonb_build_array(
      jsonb_build_object(
        'key', 'dead_lettered_webhooks',
        'severity', 'warning',
        'count', webhook_dead_lettered,
        'message', 'Dead-lettered PayMongo webhook events require Platform review or replay.'
      )
    );
  end if;

  select
    count(*) filter (
      where issue.value ->> 'severity' = 'critical'
    ),
    count(*) filter (
      where issue.value ->> 'severity' = 'warning'
    )
  into critical_count, warning_count
  from jsonb_array_elements(issue_list) issue(value);

  score_value := greatest(
    0,
    100
      - least(80, critical_count::integer * 25)
      - least(20, warning_count::integer * 5)
  );

  return jsonb_build_object(
    'healthy', critical_count = 0 and warning_count = 0,
    'score', score_value,
    'checkedAt', pg_catalog.now(),
    'subscriptions', jsonb_build_object(
      'total', subscription_total,
      'active', subscription_active,
      'pending', subscription_pending,
      'pastDue', subscription_past_due,
      'nonPayMongo', non_paymongo_subscriptions,
      'expiredPendingCheckouts', expired_pending_checkouts,
      'pendingWithoutCheckout', pending_without_checkout
    ),
    'payments', jsonb_build_object(
      'total', payment_total,
      'paid', payment_paid,
      'failed', payment_failed,
      'pending', payment_pending,
      'paidMissingInvoice', paid_missing_invoice,
      'invoiceAmountMismatches', invoice_amount_mismatches
    ),
    'webhooks', jsonb_build_object(
      'total', webhook_total,
      'processed', webhook_processed,
      'failed', webhook_failed,
      'ignored', webhook_ignored,
      'deadLettered', webhook_dead_lettered,
      'processedLast24Hours', webhook_processed_24h,
      'paidEventsWithoutPaymentLedger', paid_events_without_payment
    ),
    'invoices', jsonb_build_object(
      'total', invoice_total,
      'paid', invoice_paid,
      'open', invoice_open
    ),
    'usage', jsonb_build_object(
      'openStatements', usage_open,
      'finalizedStatements', usage_finalized,
      'invoicedStatements', usage_invoiced
    ),
    'lifecycle', jsonb_build_object(
      'events', lifecycle_total,
      'recentEvents24Hours', lifecycle_24h
    ),
    'issues', issue_list
  );
end;
$function$;

revoke all on function public.platform_paymongo_acceptance_report()
from public, anon;

grant execute on function public.platform_paymongo_acceptance_report()
to authenticated;

comment on function public.platform_paymongo_acceptance_report() is
  'Read-only Flowtix Platform acceptance report for PayMongo subscription, payment, webhook, invoice, usage, and lifecycle ledger consistency.';

notify pgrst, 'reload schema';

commit;
