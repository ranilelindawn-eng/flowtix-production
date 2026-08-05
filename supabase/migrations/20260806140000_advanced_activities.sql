begin;

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  activity_type text not null check (activity_type in ('call','email','sms','meeting','note','task','status_change','web','social','other')),
  direction text not null default 'internal' check (direction in ('inbound','outbound','internal')),
  status text not null default 'completed' check (status in ('planned','in_progress','completed','cancelled','failed')),
  subject text not null check (char_length(subject) between 1 and 300),
  body text,
  outcome text,
  occurred_at timestamptz not null default now(),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 604800),
  source text not null default 'manual' check (source in ('manual','telephony','email','sms','calendar','task','automation','import','system')),
  visibility text not null default 'organization' check (visibility in ('private','team','organization')),
  owner_membership_id uuid references public.organization_members(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_activities_has_relationship check (contact_id is not null or company_id is not null or opportunity_id is not null)
);

create table if not exists public.activity_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  label text not null check (char_length(label) between 1 and 100),
  field_type text not null check (field_type in ('text','number','date','boolean','select','multi_select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, field_key)
);

create index if not exists crm_activities_org_occurred_idx on public.crm_activities(organization_id, occurred_at desc);
create index if not exists crm_activities_contact_idx on public.crm_activities(contact_id, occurred_at desc) where contact_id is not null;
create index if not exists crm_activities_company_idx on public.crm_activities(company_id, occurred_at desc) where company_id is not null;
create index if not exists crm_activities_opportunity_idx on public.crm_activities(opportunity_id, occurred_at desc) where opportunity_id is not null;
create index if not exists crm_activities_type_status_idx on public.crm_activities(organization_id, activity_type, status, occurred_at desc);

create or replace function public.validate_crm_activity_relationships()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare relationship_org uuid;
begin
  if new.contact_id is not null then
    select organization_id into relationship_org from public.contacts where id=new.contact_id;
    if relationship_org is distinct from new.organization_id then raise exception 'ACTIVITY_CONTACT_ORGANIZATION_MISMATCH'; end if;
  end if;
  if new.company_id is not null then
    select organization_id into relationship_org from public.companies where id=new.company_id;
    if relationship_org is distinct from new.organization_id then raise exception 'ACTIVITY_COMPANY_ORGANIZATION_MISMATCH'; end if;
  end if;
  if new.opportunity_id is not null then
    select organization_id into relationship_org from public.opportunities where id=new.opportunity_id;
    if relationship_org is distinct from new.organization_id then raise exception 'ACTIVITY_OPPORTUNITY_ORGANIZATION_MISMATCH'; end if;
  end if;
  if new.owner_membership_id is not null then
    select organization_id into relationship_org from public.organization_members where id=new.owner_membership_id and status='active';
    if relationship_org is distinct from new.organization_id then raise exception 'ACTIVITY_OWNER_ORGANIZATION_MISMATCH'; end if;
  end if;
  new.updated_at=now();
  return new;
end $$;

drop trigger if exists crm_activities_validate on public.crm_activities;
create trigger crm_activities_validate before insert or update on public.crm_activities
for each row execute function public.validate_crm_activity_relationships();

alter table public.crm_activities enable row level security;
alter table public.activity_field_definitions enable row level security;

create policy crm_activities_select on public.crm_activities for select to authenticated using(public.is_org_member(organization_id));
create policy crm_activities_insert on public.crm_activities for insert to authenticated with check(public.is_org_member(organization_id) and created_by=auth.uid());
create policy crm_activities_update on public.crm_activities for update to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy crm_activities_delete on public.crm_activities for delete to authenticated using(public.is_org_member(organization_id));
create policy activity_fields_select on public.activity_field_definitions for select to authenticated using(public.is_org_member(organization_id));
create policy activity_fields_manage on public.activity_field_definitions for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=activity_field_definitions.organization_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','manager')))
with check (exists (select 1 from public.organization_members m where m.organization_id=activity_field_definitions.organization_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','manager')));

grant select,insert,update,delete on public.crm_activities,public.activity_field_definitions to authenticated;
grant all on public.crm_activities,public.activity_field_definitions to service_role;

notify pgrst,'reload schema';
commit;
