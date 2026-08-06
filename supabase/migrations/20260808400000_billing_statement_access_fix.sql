begin;

-- Ensure billing tables are accessible to service-role connections and
-- retain tenant isolation through existing RLS policies for authenticated users.
-- These functions only perform read operations on billing tables.
grant select on public.usage_billing_statements to service_role;
grant select on public.billing_invoices to service_role;

commit;
