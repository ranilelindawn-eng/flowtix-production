begin;

-- The durable sequence worker executes with SUPABASE_SERVICE_ROLE_KEY and
-- reads sequence_steps directly while processing sequence.execute_step jobs.
-- RLS bypass alone does not replace PostgreSQL table privileges, so grant
-- only the access the worker actually needs here.
grant select
on table public.sequence_steps
to service_role;

commit;
