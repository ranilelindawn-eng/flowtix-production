-- Flowtix Automation 1.4: Post-call automation role and RLS enforcement.
-- Reuses the existing Flowtix role/permission architecture and grants the
-- narrow post-call configuration permission to Owner, Admin, and Manager.
-- Agents can view Settings generally where already allowed, but cannot write
-- post-call automation configuration.

begin;

insert into public.permission_catalog (
  permission_key,
  category,
  display_name,
  description
)
values (
  'automation.post_call.manage',
  'automation',
  'Manage post-call automation',
  'Configure organization post-call email and SMS follow-up automation'
)
on conflict (permission_key) do update
set
  category = excluded.category,
  display_name = excluded.display_name,
  description = excluded.description;

create or replace function public.can_manage_post_call_automation(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members as member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
      and member.role in ('owner', 'admin', 'manager')
  );
$$;

revoke all
on function public.can_manage_post_call_automation(uuid)
from public, anon;

grant execute
on function public.can_manage_post_call_automation(uuid)
to authenticated, service_role;

drop policy if exists post_call_automation_configs_write
  on public.post_call_automation_configs;

drop policy if exists post_call_automation_configs_insert
  on public.post_call_automation_configs;

drop policy if exists post_call_automation_configs_update
  on public.post_call_automation_configs;

drop policy if exists post_call_automation_configs_delete
  on public.post_call_automation_configs;

create policy post_call_automation_configs_insert
on public.post_call_automation_configs
for insert
to authenticated
with check (
  public.can_manage_post_call_automation(organization_id)
);

create policy post_call_automation_configs_update
on public.post_call_automation_configs
for update
to authenticated
using (
  public.can_manage_post_call_automation(organization_id)
)
with check (
  public.can_manage_post_call_automation(organization_id)
);

create policy post_call_automation_configs_delete
on public.post_call_automation_configs
for delete
to authenticated
using (
  public.can_manage_post_call_automation(organization_id)
);

comment on function public.can_manage_post_call_automation(uuid) is
  'Returns true only for an active Owner, Admin, or Manager of the target organization. Used by post-call automation RLS.';

notify pgrst, 'reload schema';

commit;
