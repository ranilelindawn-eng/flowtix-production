-- Allow authenticated application users to access the invitations table.
-- RLS policies below still control which organization rows they may access.

grant select, insert, update, delete
on table public.organization_invitations
to authenticated;

revoke all
on table public.organization_invitations
from anon;

alter table public.organization_invitations
enable row level security;

-- Helper: only active owners and administrators may manage invitations.
create or replace function public.can_manage_organization_team(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and coalesce(om.status, 'active') = 'active'
      and om.role in ('owner', 'admin')
  );
$$;

revoke all
on function public.can_manage_organization_team(uuid)
from public;

grant execute
on function public.can_manage_organization_team(uuid)
to authenticated;

-- Remove conflicting policies with these names, if present.
drop policy if exists organization_invitations_select
on public.organization_invitations;

drop policy if exists organization_invitations_insert
on public.organization_invitations;

drop policy if exists organization_invitations_update
on public.organization_invitations;

drop policy if exists organization_invitations_delete
on public.organization_invitations;

-- Active organization members may view pending invitations for their workspace.
create policy organization_invitations_select
on public.organization_invitations
for select
to authenticated
using (
  public.is_organization_member(organization_id)
);

-- Only owners/admins may create, modify, or revoke invitations.
create policy organization_invitations_insert
on public.organization_invitations
for insert
to authenticated
with check (
  public.can_manage_organization_team(organization_id)
);

create policy organization_invitations_update
on public.organization_invitations
for update
to authenticated
using (
  public.can_manage_organization_team(organization_id)
)
with check (
  public.can_manage_organization_team(organization_id)
);

create policy organization_invitations_delete
on public.organization_invitations
for delete
to authenticated
using (
  public.can_manage_organization_team(organization_id)
);

notify pgrst, 'reload schema';