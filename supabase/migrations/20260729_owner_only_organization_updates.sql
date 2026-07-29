begin;

alter table public.organizations enable row level security;

-- Remove every known legacy policy that allowed administrators to update
-- organization identity.
drop policy if exists organizations_update_admins on public.organizations;
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_update_owner_only on public.organizations;

create policy organizations_update_owner_only
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = organizations.id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = organizations.id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role = 'owner'
  )
);

commit;

select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'organizations'
  and cmd = 'UPDATE'
order by policyname;
