begin;

-- ring_groups is customer-facing dashboard data. Keep anonymous access denied,
-- allow authenticated sessions to read it, and rely on the existing tenant RLS
-- policy (public.is_org_member(organization_id)) for organization isolation.
revoke all on table public.ring_groups from anon;
grant select on table public.ring_groups to authenticated;
grant all on table public.ring_groups to service_role;

alter table public.ring_groups enable row level security;

commit;
