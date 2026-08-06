begin;

grant select on public.billing_payments to service_role;
grant select on public.billing_payment_events to service_role;
grant select on public.billing_webhook_attempts to service_role;

grant select on public.subscription_lifecycle_events to service_role;

grant select on public.billing_invoices to service_role;
grant select on public.usage_billing_statements to service_role;

commit;
