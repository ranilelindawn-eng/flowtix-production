begin;

-- Resolve the signed-in user's active organization without depending on
-- organization_members SELECT policies. The function only returns a row that
-- belongs to auth.uid(), so it remains tenant-safe while avoiding RLS lookup
-- failures that caused protected pages to redirect to /dashboard.
create or replace function public.get_current_organization_membership()
returns table (
  organization_id uuid,
  role text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  selected_organization_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select membership.organization_id
  into selected_organization_id
  from public.organization_members as membership
  left join public.profiles as profile
    on profile.id = auth.uid()
  where membership.user_id = auth.uid()
    and coalesce(membership.status, 'active') = 'active'
  order by
    case
      when membership.organization_id = profile.organization_id then 0
      else 1
    end,
    membership.created_at asc
  limit 1;

  if selected_organization_id is null then
    return;
  end if;

  update public.profiles
  set
    organization_id = selected_organization_id,
    updated_at = now()
  where id = auth.uid()
    and organization_id is distinct from selected_organization_id;

  return query
  select
    membership.organization_id,
    membership.role::text
  from public.organization_members as membership
  where membership.user_id = auth.uid()
    and membership.organization_id = selected_organization_id
    and coalesce(membership.status, 'active') = 'active'
    and membership.role in ('owner', 'admin', 'manager', 'agent')
  limit 1;
end;
$$;

revoke all
on function public.get_current_organization_membership()
from public;

grant execute
on function public.get_current_organization_membership()
to authenticated, service_role;

-- Ensure a signed-in member can always read their own membership row. Existing
-- broader same-organization policies remain in place for authorized team views.
drop policy if exists organization_members_select_self
on public.organization_members;

create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

commit;

select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'get_current_organization_membership';
