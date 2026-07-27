-- CallFlow Phase 3: CRM expansion
-- Run after the existing organization/contact migrations.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  domain text,
  industry text,
  phone text,
  email text,
  website text,
  address text,
  city text,
  country text,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive','prospect','customer')),
  description text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts add column if not exists company_id uuid references public.companies(id) on delete set null;

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  probability integer not null default 0 check (probability between 0 and 100),
  created_at timestamptz not null default now(),
  unique (pipeline_id, position)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  value numeric(14,2) not null default 0,
  currency text not null default 'USD',
  probability integer not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','won','lost')),
  description text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact','company','opportunity','campaign')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, entity_type, entity_id)
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('email','sms')),
  subject text,
  body text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.snippets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  shortcut text not null,
  content text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, shortcut)
);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  position integer not null,
  channel text not null check (channel in ('email','sms','task','call')),
  delay_days integer not null default 0 check (delay_days >= 0),
  subject text,
  body text,
  template_id uuid references public.message_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sequence_id, position)
);

create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  current_step integer not null default 1,
  status text not null default 'active' check (status in ('active','completed','paused','cancelled')),
  next_run_at timestamptz,
  enrolled_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (sequence_id, contact_id)
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  campaign_id uuid,
  channel text not null check (channel in ('email','sms')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  recipient text not null,
  sender text,
  subject text,
  body text not null,
  provider text,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','received')),
  error_message text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.internal_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact','company','opportunity','campaign')),
  entity_id uuid not null,
  body text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  comment_id uuid not null references public.internal_comments(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comment_id, mentioned_user_id)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact','company','opportunity','campaign','comment')),
  entity_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists companies_organization_idx on public.companies(organization_id, created_at desc);
create index if not exists opportunities_stage_idx on public.opportunities(organization_id, pipeline_id, stage_id);
create index if not exists communications_organization_idx on public.communication_messages(organization_id, created_at desc);
create index if not exists comments_entity_idx on public.internal_comments(organization_id, entity_type, entity_id, created_at desc);
create index if not exists attachments_entity_idx on public.attachments(organization_id, entity_type, entity_id, created_at desc);

-- Reuse the membership model established by earlier CallFlow migrations.
-- A user may access a row only when they belong to its organization.
create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and coalesce(om.status, 'active') = 'active'
  );
$$;

alter table public.companies enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.tags enable row level security;
alter table public.entity_tags enable row level security;
alter table public.message_templates enable row level security;
alter table public.snippets enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_enrollments enable row level security;
alter table public.communication_messages enable row level security;
alter table public.internal_comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.attachments enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','pipelines','pipeline_stages','opportunities','tags','entity_tags',
    'message_templates','snippets','sequences','sequence_steps','sequence_enrollments',
    'communication_messages','internal_comments','comment_mentions','attachments'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant_access', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id))',
      t || '_tenant_access', t
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-attachments', 'crm-attachments', false, 26214400)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists crm_attachments_read on storage.objects;
create policy crm_attachments_read on storage.objects
for select to authenticated
using (
  bucket_id = 'crm-attachments'
  and public.is_organization_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists crm_attachments_insert on storage.objects;
create policy crm_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'crm-attachments'
  and public.is_organization_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists crm_attachments_delete on storage.objects;
create policy crm_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'crm-attachments'
  and public.is_organization_member((storage.foldername(name))[1]::uuid)
);

-- Seed a default pipeline for organizations that do not have one yet.
insert into public.pipelines (organization_id, name, description, is_default, created_by)
select o.id, 'Sales Pipeline', 'Default opportunity pipeline', true, o.created_by
from public.organizations o
where not exists (select 1 from public.pipelines p where p.organization_id = o.id);

insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability)
select p.organization_id, p.id, s.name, s.position, s.probability
from public.pipelines p
cross join (values
  ('New', 1, 10),
  ('Qualified', 2, 25),
  ('Proposal', 3, 50),
  ('Negotiation', 4, 75),
  ('Won', 5, 100)
) as s(name, position, probability)
where p.is_default = true
  and not exists (select 1 from public.pipeline_stages ps where ps.pipeline_id = p.id);
