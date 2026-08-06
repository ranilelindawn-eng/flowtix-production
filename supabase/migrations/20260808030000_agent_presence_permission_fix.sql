begin;

-- Phase 3.2 created organization-scoped RLS policies for the agent presence
-- tables, but omitted the underlying PostgreSQL table privileges.
-- PostgreSQL checks these privileges before evaluating RLS.

grant select, insert, update
on public.agent_presence
to authenticated;

grant select, insert, update
on public.agent_devices
to authenticated;

grant select, insert
on public.agent_presence_history
to authenticated;

grant all
on public.agent_presence
to service_role;

grant all
on public.agent_devices
to service_role;

grant all
on public.agent_presence_history
to service_role;

commit;
