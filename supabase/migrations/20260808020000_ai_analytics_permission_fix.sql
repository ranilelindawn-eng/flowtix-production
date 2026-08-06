begin;

-- The AI usage-control migration created an RLS SELECT policy for
-- authenticated organization members, but it did not grant the underlying
-- PostgreSQL SELECT privilege. RLS policies are evaluated only after table
-- privileges are granted.

grant select
on public.ai_usage_reservations
to authenticated;

grant select
on public.ai_usage_policies
to authenticated;

grant all
on public.ai_usage_reservations
to service_role;

grant all
on public.ai_usage_policies
to service_role;

commit;
