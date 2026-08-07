-- Supabase row-level security policies for CallFlow multi-tenant data access.

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists(
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists(
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_org_writer(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists(
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role in ('owner', 'admin', 'member')
  );
$$;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.is_org_writer(uuid) from public, anon;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_writer(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.contact_tasks enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.calls enable row level security;
alter table public.recordings enable row level security;
alter table public.transcripts enable row level security;
alter table public.notes enable row level security;

-- Organizations

drop policy if exists organizations_select on public.organizations;

create policy organizations_select
on public.organizations
for select
to authenticated
using (
  public.is_org_member(id)
);

drop policy if exists organizations_insert on public.organizations;

create policy organizations_insert
on public.organizations
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

drop policy if exists organizations_update on public.organizations;

create policy organizations_update
on public.organizations
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_admin(id)
)
with check (
  auth.uid() is not null
  and public.is_org_admin(id)
);

drop policy if exists organizations_delete on public.organizations;

create policy organizations_delete
on public.organizations
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_admin(id)
);

-- Profiles

drop policy if exists profiles_select on public.profiles;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists profiles_insert on public.profiles;

create policy profiles_insert
on public.profiles
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and organization_id in (
    select organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.status = 'active'
  )
);

drop policy if exists profiles_update on public.profiles;

create policy profiles_update
on public.profiles
for update
to authenticated
using (
  auth.uid() is not null
  and (
    auth.uid() = id
    or public.is_org_admin(organization_id)
  )
)
with check (
  auth.uid() is not null
  and (
    auth.uid() = id
    or public.is_org_admin(organization_id)
  )
);

drop policy if exists profiles_delete on public.profiles;

create policy profiles_delete
on public.profiles
for delete
to authenticated
using (
  auth.uid() is not null
  and (
    auth.uid() = id
    or public.is_org_admin(organization_id)
  )
);

-- Organization members

drop policy if exists organization_members_select
on public.organization_members;

create policy organization_members_select
on public.organization_members
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists organization_members_insert
on public.organization_members;

create policy organization_members_insert
on public.organization_members
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_admin(organization_id)
  and created_by = auth.uid()
);

drop policy if exists organization_members_update
on public.organization_members;

create policy organization_members_update
on public.organization_members
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_admin(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_admin(organization_id)
);

drop policy if exists organization_members_delete
on public.organization_members;

create policy organization_members_delete
on public.organization_members
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_admin(organization_id)
);

-- Contacts

drop policy if exists contacts_select on public.contacts;

create policy contacts_select
on public.contacts
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists contacts_insert on public.contacts;

create policy contacts_insert
on public.contacts
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists contacts_update on public.contacts;

create policy contacts_update
on public.contacts
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists contacts_delete on public.contacts;

create policy contacts_delete
on public.contacts
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

-- Campaigns

drop policy if exists campaigns_select on public.campaigns;

create policy campaigns_select
on public.campaigns
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists campaigns_insert on public.campaigns;

create policy campaigns_insert
on public.campaigns
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists campaigns_update on public.campaigns;

create policy campaigns_update
on public.campaigns
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists campaigns_delete on public.campaigns;

create policy campaigns_delete
on public.campaigns
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

-- Campaign members

drop policy if exists campaign_members_select
on public.campaign_members;

create policy campaign_members_select
on public.campaign_members
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists campaign_members_insert
on public.campaign_members;

create policy campaign_members_insert
on public.campaign_members
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists campaign_members_update
on public.campaign_members;

create policy campaign_members_update
on public.campaign_members
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists campaign_members_delete
on public.campaign_members;

create policy campaign_members_delete
on public.campaign_members
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

-- Calls

drop policy if exists calls_select on public.calls;

create policy calls_select
on public.calls
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists calls_insert on public.calls;

create policy calls_insert
on public.calls
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists calls_update on public.calls;

create policy calls_update
on public.calls
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists calls_delete on public.calls;

create policy calls_delete
on public.calls
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

-- Recordings

drop policy if exists recordings_select on public.recordings;

create policy recordings_select
on public.recordings
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists recordings_insert on public.recordings;

create policy recordings_insert
on public.recordings
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists recordings_update on public.recordings;

create policy recordings_update
on public.recordings
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists recordings_delete on public.recordings;

create policy recordings_delete
on public.recordings
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

-- Transcripts

drop policy if exists transcripts_select on public.transcripts;

create policy transcripts_select
on public.transcripts
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists transcripts_insert on public.transcripts;

create policy transcripts_insert
on public.transcripts
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists transcripts_update on public.transcripts;

create policy transcripts_update
on public.transcripts
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists transcripts_delete on public.transcripts;

create policy transcripts_delete
on public.transcripts
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

-- Notes

drop policy if exists notes_select on public.notes;

create policy notes_select
on public.notes
for select
to authenticated
using (
  auth.uid() is not null
  and public.is_org_member(organization_id)
);

drop policy if exists notes_insert on public.notes;

create policy notes_insert
on public.notes
for insert
to authenticated
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
  and created_by = auth.uid()
);

drop policy if exists notes_update on public.notes;

create policy notes_update
on public.notes
for update
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
)
with check (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);

drop policy if exists notes_delete on public.notes;

create policy notes_delete
on public.notes
for delete
to authenticated
using (
  auth.uid() is not null
  and public.is_org_writer(organization_id)
);