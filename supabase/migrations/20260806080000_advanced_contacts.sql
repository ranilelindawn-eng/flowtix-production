-- Flowtix Phase 5.1: Advanced Contacts

alter table public.contacts
  add column if not exists preferred_name text,
  add column if not exists lifecycle_stage text not null default 'lead',
  add column if not exists source text not null default 'manual',
  add column if not exists lead_score integer not null default 0,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists do_not_email boolean not null default false,
  add column if not exists do_not_sms boolean not null default false,
  add column if not exists do_not_call boolean not null default false,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists merged_into_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_lifecycle_stage_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts add constraint contacts_lifecycle_stage_check
      check (lifecycle_stage in ('lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist','inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_lead_score_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts add constraint contacts_lead_score_check
      check (lead_score between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_merge_target_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts add constraint contacts_merge_target_check
      check (merged_into_contact_id is null or merged_into_contact_id <> id);
  end if;
end $$;

create index if not exists contacts_org_lifecycle_idx
  on public.contacts (organization_id, lifecycle_stage, created_at desc)
  where merged_into_contact_id is null;
create index if not exists contacts_org_source_idx
  on public.contacts (organization_id, source, created_at desc)
  where merged_into_contact_id is null;
create index if not exists contacts_org_score_idx
  on public.contacts (organization_id, lead_score desc, updated_at desc)
  where merged_into_contact_id is null;
create index if not exists contacts_org_follow_up_idx
  on public.contacts (organization_id, next_follow_up_at)
  where next_follow_up_at is not null and merged_into_contact_id is null;
create index if not exists contacts_org_email_normalized_idx
  on public.contacts (organization_id, lower(trim(email)))
  where email is not null and trim(email) <> '' and merged_into_contact_id is null;
create index if not exists contacts_org_phone_normalized_idx
  on public.contacts (organization_id, regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g'))
  where phone is not null and trim(phone) <> '' and merged_into_contact_id is null;

create table if not exists public.contact_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null default 'text' check (field_type in ('text','number','date','boolean','select','multi_select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, field_key)
);

create index if not exists contact_field_definitions_org_position_idx
  on public.contact_field_definitions (organization_id, position, label);

alter table public.contact_field_definitions enable row level security;
revoke all on public.contact_field_definitions from anon;
grant select, insert, update, delete on public.contact_field_definitions to authenticated;

drop policy if exists contact_field_definitions_select_member on public.contact_field_definitions;
create policy contact_field_definitions_select_member
on public.contact_field_definitions for select to authenticated
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = contact_field_definitions.organization_id
    and member.user_id = auth.uid()
    and member.status = 'active'
));

drop policy if exists contact_field_definitions_manage_admin on public.contact_field_definitions;
create policy contact_field_definitions_manage_admin
on public.contact_field_definitions for all to authenticated
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = contact_field_definitions.organization_id
    and member.user_id = auth.uid()
    and member.status = 'active'
    and member.role in ('owner','admin','manager')
))
with check (exists (
  select 1 from public.organization_members member
  where member.organization_id = contact_field_definitions.organization_id
    and member.user_id = auth.uid()
    and member.status = 'active'
    and member.role in ('owner','admin','manager')
));

create or replace function public.find_contact_duplicates(
  p_organization_id uuid,
  p_contact_id uuid default null,
  p_email text default null,
  p_phone text default null
)
returns table (
  contact_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  match_reasons text[]
)
language sql
security definer
set search_path = public
as $$
  with input as (
    select
      lower(trim(coalesce(p_email, source.email, ''))) as normalized_email,
      regexp_replace(coalesce(p_phone, source.phone, ''), '[^0-9+]', '', 'g') as normalized_phone
    from (select email, phone from public.contacts where id = p_contact_id) source
    right join (select 1) singleton on true
  )
  select
    candidate.id,
    candidate.first_name,
    candidate.last_name,
    candidate.email,
    candidate.phone,
    array_remove(array[
      case when input.normalized_email <> '' and lower(trim(coalesce(candidate.email, ''))) = input.normalized_email then 'email' end,
      case when input.normalized_phone <> '' and regexp_replace(coalesce(candidate.phone, ''), '[^0-9+]', '', 'g') = input.normalized_phone then 'phone' end
    ], null)
  from public.contacts candidate
  cross join input
  where candidate.organization_id = p_organization_id
    and candidate.merged_into_contact_id is null
    and (p_contact_id is null or candidate.id <> p_contact_id)
    and (
      (input.normalized_email <> '' and lower(trim(coalesce(candidate.email, ''))) = input.normalized_email)
      or
      (input.normalized_phone <> '' and regexp_replace(coalesce(candidate.phone, ''), '[^0-9+]', '', 'g') = input.normalized_phone)
    )
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = p_organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
  order by candidate.updated_at desc;
$$;

grant execute on function public.find_contact_duplicates(uuid, uuid, text, text) to authenticated;
