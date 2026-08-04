-- Flowtix Phase 1.4: extend membership ownership and scoped RLS across CRM modules.

begin;

-- Complete the task ownership backfill that was intentionally deferred in Phase 1.3.
update public.contact_tasks record
set owner_membership_id = member.id
from public.organization_members member
where record.owner_membership_id is null
  and member.organization_id = record.organization_id
  and member.status = 'active'
  and member.user_id = coalesce(record.assigned_to, record.created_by);

-- Keep legacy user ownership columns synchronized where they exist.
create or replace function public.sync_legacy_owner_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_user_id uuid;
begin
  if new.owner_membership_id is null then
    return new;
  end if;

  select member.user_id
  into assigned_user_id
  from public.organization_members member
  where member.id = new.owner_membership_id
    and member.organization_id = new.organization_id
    and member.status = 'active';

  if assigned_user_id is null then
    raise exception 'Assigned owner must be an active member of the same organization.';
  end if;

  if tg_table_name in ('companies', 'opportunities', 'calendar_events') then
    new.owner_id := assigned_user_id;
  elsif tg_table_name = 'contact_tasks' then
    new.assigned_to := assigned_user_id;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies',
    'opportunities',
    'contact_tasks',
    'calendar_events'
  ]
  loop
    execute format(
      'drop trigger if exists sync_%I_legacy_owner on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create trigger sync_%I_legacy_owner before insert or update of organization_id, owner_membership_id on public.%I for each row execute function public.sync_legacy_owner_from_membership()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- Remove broad tenant-wide policies before applying record ownership scopes.
drop policy if exists companies_tenant_access on public.companies;
drop policy if exists opportunities_tenant_access on public.opportunities;
drop policy if exists contact_tasks_tenant_access on public.contact_tasks;
drop policy if exists calls_tenant_access on public.calls;
drop policy if exists campaigns_tenant_access on public.campaigns;
drop policy if exists calls_phase5_tenant on public.calls;
drop policy if exists contact_tasks_phase5_tenant on public.contact_tasks;

drop policy if exists calendar_events_select_members on public.calendar_events;
drop policy if exists calendar_events_insert_members on public.calendar_events;
drop policy if exists calendar_events_update_authorized on public.calendar_events;
drop policy if exists calendar_events_delete_authorized on public.calendar_events;

-- Companies
drop policy if exists companies_select_scoped on public.companies;
create policy companies_select_scoped on public.companies
for select to authenticated
using (
  public.can_access_owned_record(
    companies.organization_id,
    companies.owner_membership_id,
    companies.owner_id,
    companies.created_by
  )
);
drop policy if exists companies_insert_scoped on public.companies;
create policy companies_insert_scoped on public.companies
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(companies.organization_id)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(companies.organization_id)
    or owner_membership_id = public.current_organization_membership_id(companies.organization_id)
  )
);
drop policy if exists companies_update_scoped on public.companies;
create policy companies_update_scoped on public.companies
for update to authenticated
using (public.can_access_owned_record(companies.organization_id, companies.owner_membership_id, companies.owner_id, companies.created_by))
with check (
  public.can_access_owned_record(companies.organization_id, companies.owner_membership_id, companies.owner_id, companies.created_by)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(companies.organization_id)
    or owner_membership_id = public.current_organization_membership_id(companies.organization_id)
  )
);
drop policy if exists companies_delete_scoped on public.companies;
create policy companies_delete_scoped on public.companies
for delete to authenticated
using (
  public.can_manage_organization_assignments(companies.organization_id)
  or owner_membership_id = public.current_organization_membership_id(companies.organization_id)
  or created_by = auth.uid()
);

-- Opportunities
drop policy if exists opportunities_select_scoped on public.opportunities;
create policy opportunities_select_scoped on public.opportunities
for select to authenticated
using (public.can_access_owned_record(opportunities.organization_id, opportunities.owner_membership_id, opportunities.owner_id, opportunities.created_by));
drop policy if exists opportunities_insert_scoped on public.opportunities;
create policy opportunities_insert_scoped on public.opportunities
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(opportunities.organization_id)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(opportunities.organization_id)
    or owner_membership_id = public.current_organization_membership_id(opportunities.organization_id)
  )
);
drop policy if exists opportunities_update_scoped on public.opportunities;
create policy opportunities_update_scoped on public.opportunities
for update to authenticated
using (public.can_access_owned_record(opportunities.organization_id, opportunities.owner_membership_id, opportunities.owner_id, opportunities.created_by))
with check (
  public.can_access_owned_record(opportunities.organization_id, opportunities.owner_membership_id, opportunities.owner_id, opportunities.created_by)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(opportunities.organization_id)
    or owner_membership_id = public.current_organization_membership_id(opportunities.organization_id)
  )
);
drop policy if exists opportunities_delete_scoped on public.opportunities;
create policy opportunities_delete_scoped on public.opportunities
for delete to authenticated
using (
  public.can_manage_organization_assignments(opportunities.organization_id)
  or owner_membership_id = public.current_organization_membership_id(opportunities.organization_id)
  or created_by = auth.uid()
);

-- Contact tasks
drop policy if exists contact_tasks_select_scoped on public.contact_tasks;
create policy contact_tasks_select_scoped on public.contact_tasks
for select to authenticated
using (public.can_access_owned_record(contact_tasks.organization_id, contact_tasks.owner_membership_id, contact_tasks.assigned_to, contact_tasks.created_by));
drop policy if exists contact_tasks_insert_scoped on public.contact_tasks;
create policy contact_tasks_insert_scoped on public.contact_tasks
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(contact_tasks.organization_id)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(contact_tasks.organization_id)
    or owner_membership_id = public.current_organization_membership_id(contact_tasks.organization_id)
  )
);
drop policy if exists contact_tasks_update_scoped on public.contact_tasks;
create policy contact_tasks_update_scoped on public.contact_tasks
for update to authenticated
using (public.can_access_owned_record(contact_tasks.organization_id, contact_tasks.owner_membership_id, contact_tasks.assigned_to, contact_tasks.created_by))
with check (
  public.can_access_owned_record(contact_tasks.organization_id, contact_tasks.owner_membership_id, contact_tasks.assigned_to, contact_tasks.created_by)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(contact_tasks.organization_id)
    or owner_membership_id = public.current_organization_membership_id(contact_tasks.organization_id)
  )
);
drop policy if exists contact_tasks_delete_scoped on public.contact_tasks;
create policy contact_tasks_delete_scoped on public.contact_tasks
for delete to authenticated
using (
  public.can_manage_organization_assignments(contact_tasks.organization_id)
  or owner_membership_id = public.current_organization_membership_id(contact_tasks.organization_id)
  or created_by = auth.uid()
);

-- Calendar events
drop policy if exists calendar_events_select_scoped on public.calendar_events;
create policy calendar_events_select_scoped on public.calendar_events
for select to authenticated
using (public.can_access_owned_record(calendar_events.organization_id, calendar_events.owner_membership_id, calendar_events.owner_id, calendar_events.created_by));
drop policy if exists calendar_events_insert_scoped on public.calendar_events;
create policy calendar_events_insert_scoped on public.calendar_events
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(calendar_events.organization_id)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(calendar_events.organization_id)
    or owner_membership_id = public.current_organization_membership_id(calendar_events.organization_id)
  )
);
drop policy if exists calendar_events_update_scoped on public.calendar_events;
create policy calendar_events_update_scoped on public.calendar_events
for update to authenticated
using (public.can_access_owned_record(calendar_events.organization_id, calendar_events.owner_membership_id, calendar_events.owner_id, calendar_events.created_by))
with check (
  public.can_access_owned_record(calendar_events.organization_id, calendar_events.owner_membership_id, calendar_events.owner_id, calendar_events.created_by)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(calendar_events.organization_id)
    or owner_membership_id = public.current_organization_membership_id(calendar_events.organization_id)
  )
);
drop policy if exists calendar_events_delete_scoped on public.calendar_events;
create policy calendar_events_delete_scoped on public.calendar_events
for delete to authenticated
using (
  public.can_manage_organization_assignments(calendar_events.organization_id)
  or owner_membership_id = public.current_organization_membership_id(calendar_events.organization_id)
  or created_by = auth.uid()
);

-- Calls (legacy owner is represented by created_by until all provider webhooks carry membership ownership).
drop policy if exists calls_select_scoped on public.calls;
create policy calls_select_scoped on public.calls
for select to authenticated
using (public.can_access_owned_record(calls.organization_id, calls.owner_membership_id, calls.created_by, calls.created_by));
drop policy if exists calls_insert_scoped on public.calls;
create policy calls_insert_scoped on public.calls
for insert to authenticated
with check (
  public.is_organization_member(calls.organization_id)
  and (
    created_by = auth.uid()
    or auth.role() = 'service_role'
  )
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(calls.organization_id)
    or owner_membership_id = public.current_organization_membership_id(calls.organization_id)
  )
);
drop policy if exists calls_update_scoped on public.calls;
create policy calls_update_scoped on public.calls
for update to authenticated
using (public.can_access_owned_record(calls.organization_id, calls.owner_membership_id, calls.created_by, calls.created_by))
with check (
  public.can_access_owned_record(calls.organization_id, calls.owner_membership_id, calls.created_by, calls.created_by)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(calls.organization_id)
    or owner_membership_id = public.current_organization_membership_id(calls.organization_id)
  )
);
drop policy if exists calls_delete_scoped on public.calls;
create policy calls_delete_scoped on public.calls
for delete to authenticated
using (
  public.can_manage_organization_assignments(calls.organization_id)
  or owner_membership_id = public.current_organization_membership_id(calls.organization_id)
  or created_by = auth.uid()
);

-- Campaigns
drop policy if exists campaigns_select_scoped on public.campaigns;
create policy campaigns_select_scoped on public.campaigns
for select to authenticated
using (public.can_access_owned_record(campaigns.organization_id, campaigns.owner_membership_id, campaigns.created_by, campaigns.created_by));
drop policy if exists campaigns_insert_scoped on public.campaigns;
create policy campaigns_insert_scoped on public.campaigns
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(campaigns.organization_id)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(campaigns.organization_id)
    or owner_membership_id = public.current_organization_membership_id(campaigns.organization_id)
  )
);
drop policy if exists campaigns_update_scoped on public.campaigns;
create policy campaigns_update_scoped on public.campaigns
for update to authenticated
using (public.can_access_owned_record(campaigns.organization_id, campaigns.owner_membership_id, campaigns.created_by, campaigns.created_by))
with check (
  public.can_access_owned_record(campaigns.organization_id, campaigns.owner_membership_id, campaigns.created_by, campaigns.created_by)
  and (
    owner_membership_id is null
    or public.can_manage_organization_assignments(campaigns.organization_id)
    or owner_membership_id = public.current_organization_membership_id(campaigns.organization_id)
  )
);
drop policy if exists campaigns_delete_scoped on public.campaigns;
create policy campaigns_delete_scoped on public.campaigns
for delete to authenticated
using (
  public.can_manage_organization_assignments(campaigns.organization_id)
  or owner_membership_id = public.current_organization_membership_id(campaigns.organization_id)
  or created_by = auth.uid()
);

commit;
