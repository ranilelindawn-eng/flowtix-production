begin;

alter table public.organizations
add column if not exists timezone text;

update public.organizations
set timezone = 'UTC'
where timezone is null
   or btrim(timezone) = '';

alter table public.organizations
alter column timezone set default 'UTC';

alter table public.organizations
alter column timezone set not null;

alter table public.organizations
drop constraint if exists organizations_timezone_format_check;

alter table public.organizations
add constraint organizations_timezone_format_check
check (
  char_length(timezone) between 1 and 100
  and timezone ~ '^[A-Za-z0-9_+\-/]+$'
);

-- Keep the organization update path owner-only. This protects the time zone
-- even when a non-owner attempts to bypass the application UI.
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
    from public.organization_members as membership
    where membership.organization_id = organizations.id
      and membership.user_id = auth.uid()
      and coalesce(membership.status, 'active') = 'active'
      and membership.role::text = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = organizations.id
      and membership.user_id = auth.uid()
      and coalesce(membership.status, 'active') = 'active'
      and membership.role::text = 'owner'
  )
);

commit;

notify pgrst, 'reload schema';
