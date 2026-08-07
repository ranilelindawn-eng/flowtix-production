begin;

create unique index if not exists
    billing_invoices_payment_id_full_uidx
on public.billing_invoices (payment_id);

commit;