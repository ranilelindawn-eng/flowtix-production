-- Flowtix team role update RLS repair.
-- Restores authenticated organization owner/admin role-management updates
-- without weakening tenant isolation.
--
-- Owner:
--   may update members in their own organization.
-- Admin:
--   may update only manager/agent memberships and may only leave the target
--   as manager/agent. Owner/admin membership changes remain owner-only.
--
-- Application-level updateMemberRole() continues to enforce last-owner and
-- role-transition rules. This policy is the database authorization boundary.

begin;

alter table public.organization_members enable row level security;

drop policy if exists organization_members_update
on public.organization_members;

drop policy if exists organization_members_update_team_managers
on public.organization_members;

create policy organization_members_update_team_managers
on public.organization_members
for update
to authenticated
using (
  auth.uid() is not null
  and (
    exists (
      select 1
      from public.organization_members actor
      where actor.organization_id = organization_members.organization_id
        and actor.user_id = auth.uid()
        and coalesce(actor.status, 'active') = 'active'
        and actor.role::text = 'owner'
    )
    or (
      organization_members.role::text in ('manager', 'agent')
      and exists (
        select 1
        from public.organization_members actor
        where actor.organization_id = organization_members.organization_id
          and actor.user_id = auth.uid()
          and coalesce(actor.status, 'active') = 'active'
          and actor.role::text = 'admin'
      )
    )
  )
)
with check (
  auth.uid() is not null
  and (
    exists (
      select 1
      from public.organization_members actor
      where actor.organization_id = organization_members.organization_id
        and actor.user_id = auth.uid()
        and coalesce(actor.status, 'active') = 'active'
        and actor.role::text = 'owner'
    )
    or (
      organization_members.role::text in ('manager', 'agent')
      and exists (
        select 1
        from public.organization_members actor
        where actor.organization_id = organization_members.organization_id
          and actor.user_id = auth.uid()
          and coalesce(actor.status, 'active') = 'active'
          and actor.role::text = 'admin'
      )
    )
  )
);

notify pgrst, 'reload schema';

commit;
