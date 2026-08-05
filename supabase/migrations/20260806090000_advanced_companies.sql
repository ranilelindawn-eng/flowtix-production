-- Flowtix Phase 5.2: advanced companies
begin;

alter table public.companies
  add column if not exists legal_name text,
  add column if not exists company_type text not null default 'prospect',
  add column if not exists employee_count integer,
  add column if not exists annual_revenue numeric(18,2),
  add column if not exists currency_code text not null default 'USD',
  add column if not exists linkedin_url text,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists founded_year integer,
  add column if not exists parent_company_id uuid references public.companies(id) on delete set null,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists merged_into_company_id uuid references public.companies(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null;

do $$ begin
  alter table public.companies add constraint companies_company_type_check
    check (company_type in ('prospect','partner','customer','vendor','competitor','other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_employee_count_check
    check (employee_count is null or employee_count >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_annual_revenue_check
    check (annual_revenue is null or annual_revenue >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_founded_year_check
    check (founded_year is null or founded_year between 1000 and 9999);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_parent_not_self_check
    check (parent_company_id is null or parent_company_id <> id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_merge_not_self_check
    check (merged_into_company_id is null or merged_into_company_id <> id);
exception when duplicate_object then null; end $$;

create index if not exists companies_org_type_idx on public.companies(organization_id, company_type, created_at desc);
create index if not exists companies_org_parent_idx on public.companies(organization_id, parent_company_id);
create index if not exists companies_org_domain_lower_idx on public.companies(organization_id, lower(domain)) where domain is not null;
create index if not exists companies_org_name_lower_idx on public.companies(organization_id, lower(name));
create index if not exists companies_org_active_idx on public.companies(organization_id, created_at desc) where merged_into_company_id is null;

create table if not exists public.company_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','boolean','select','multi_select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, field_key)
);
create index if not exists company_field_definitions_org_idx on public.company_field_definitions(organization_id, is_active, position, label);
alter table public.company_field_definitions enable row level security;
drop policy if exists company_field_definitions_select on public.company_field_definitions;
create policy company_field_definitions_select on public.company_field_definitions for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists company_field_definitions_manage on public.company_field_definitions;
create policy company_field_definitions_manage on public.company_field_definitions for all to authenticated
using (public.can_manage_organization_assignments(organization_id))
with check (public.can_manage_organization_assignments(organization_id) and created_by = auth.uid());
revoke all on public.company_field_definitions from anon;

create or replace function public.validate_company_relationships()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.parent_company_id is not null and not exists (
    select 1 from public.companies c where c.id=new.parent_company_id and c.organization_id=new.organization_id
  ) then raise exception 'Parent company must belong to the same organization.'; end if;
  if new.merged_into_company_id is not null and not exists (
    select 1 from public.companies c where c.id=new.merged_into_company_id and c.organization_id=new.organization_id
  ) then raise exception 'Merged company must belong to the same organization.'; end if;
  return new;
end $$;
drop trigger if exists validate_company_relationships_trigger on public.companies;
create trigger validate_company_relationships_trigger before insert or update of organization_id,parent_company_id,merged_into_company_id on public.companies
for each row execute function public.validate_company_relationships();

create or replace function public.find_company_duplicates(
  p_organization_id uuid,
  p_company_id uuid default null,
  p_name text default null,
  p_domain text default null
) returns table(company_id uuid, name text, domain text, match_reasons text[])
language plpgsql security definer set search_path=public as $$
declare normalized_domain text := lower(regexp_replace(coalesce(p_domain,''), '^https?://(www\.)?|/.*$', '', 'gi'));
begin
  if not public.is_organization_member(p_organization_id) then raise exception 'Organization membership required.'; end if;
  return query
  select c.id,c.name,c.domain,array_remove(array[
    case when nullif(trim(p_name),'') is not null and lower(trim(c.name))=lower(trim(p_name)) then 'name' end,
    case when normalized_domain<>'' and lower(regexp_replace(coalesce(c.domain,''), '^https?://(www\.)?|/.*$', '', 'gi'))=normalized_domain then 'domain' end
  ],null)::text[]
  from public.companies c
  where c.organization_id=p_organization_id and c.merged_into_company_id is null
    and (p_company_id is null or c.id<>p_company_id)
    and ((nullif(trim(p_name),'') is not null and lower(trim(c.name))=lower(trim(p_name)))
      or (normalized_domain<>'' and lower(regexp_replace(coalesce(c.domain,''), '^https?://(www\.)?|/.*$', '', 'gi'))=normalized_domain));
end $$;
revoke all on function public.find_company_duplicates(uuid,uuid,text,text) from public,anon;
grant execute on function public.find_company_duplicates(uuid,uuid,text,text) to authenticated,service_role;

commit;
