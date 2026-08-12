-- Supabase production schema for CallFlow multi-tenant SaaS
-- This file defines the business schema, auth bootstrap, tenant isolation, and reporting objects.

create extension if not exists "pgcrypto";

DO $$ BEGIN
  CREATE TYPE public.profile_role AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.member_role AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.member_status AS ENUM (
    'active',
    'pending',
    'inactive'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_status AS ENUM (
    'active',
    'inactive',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_member_status AS ENUM (
    'pending',
    'calling',
    'completed',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.call_direction AS ENUM (
    'outbound',
    'inbound'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.call_status AS ENUM (
    'initiating',
    'queued',
    'ringing',
    'connected',
    'on-hold',
    'completed',
    'failed',
    'scheduled',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.storage_bucket_name AS ENUM (
    'recordings',
    'avatars',
    'exports'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid not null primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text,
  website text,
  plan text not null default 'starter',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid not null primary key references auth.users(id),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  role public.profile_role not null default 'member',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  user_id uuid not null references auth.users(id),
  role public.member_role not null default 'member',
  status public.member_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.contacts (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  company text,
  title text,
  status public.contact_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_notes (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  contact_id uuid not null
    references public.contacts(id)
    on delete cascade,
  body text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contact_notes_body_check
    check (char_length(trim(body)) between 1 and 5000)
);

create table if not exists public.contact_tasks (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  contact_id uuid not null
    references public.contacts(id)
    on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'pending',
  priority text not null default 'medium',
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contact_tasks_title_check
    check (char_length(trim(title)) between 1 and 200),
  constraint contact_tasks_status_check
    check (status in ('pending', 'completed', 'cancelled')),
  constraint contact_tasks_priority_check
    check (priority in ('low', 'medium', 'high'))
);

create table if not exists public.campaigns (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  name text not null,
  description text,
  status public.campaign_status not null default 'draft',
  start_date date,
  end_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  campaign_id uuid not null
    references public.campaigns(id)
    on delete cascade,
  contact_id uuid not null
    references public.contacts(id)
    on delete cascade,
  status public.campaign_member_status not null default 'pending',
  priority integer not null default 0,
  retry_count integer not null default 0,
  last_called_at timestamptz,
  last_disposition text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaign_members_campaign_contact_unique
    unique (campaign_id, contact_id),

  constraint campaign_members_priority_nonnegative
    check (priority >= 0),

  constraint campaign_members_retry_count_nonnegative
    check (retry_count >= 0)
);

create table if not exists public.calls (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  campaign_id uuid
    references public.campaigns(id)
    on delete set null,
  contact_id uuid
    references public.contacts(id)
    on delete set null,
  direction public.call_direction not null default 'outbound',
  status public.call_status not null default 'completed',
  started_at timestamptz not null default now(),
  duration_seconds integer,
  recording_available boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recordings (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  call_id uuid not null
    references public.calls(id)
    on delete cascade,
  bucket_name public.storage_bucket_name not null default 'recordings',
  storage_path text not null,
  duration_seconds integer,
  mime_type text,
  size_bytes bigint,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcripts (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  recording_id uuid not null
    references public.recordings(id)
    on delete cascade,
  language text not null default 'en',
  content text not null,
  provider text not null default 'openai',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid not null primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  contact_id uuid
    references public.contacts(id)
    on delete set null,
  call_id uuid
    references public.calls(id)
    on delete set null,
  campaign_id uuid
    references public.campaigns(id)
    on delete set null,
  recording_id uuid
    references public.recordings(id)
    on delete set null,
  content text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (contact_id is not null)::int +
    (call_id is not null)::int +
    (campaign_id is not null)::int +
    (recording_id is not null)::int
    > 0
  )
);

create index if not exists idx_profiles_organization_id
  on public.profiles(organization_id);

create index if not exists idx_profiles_created_by
  on public.profiles(created_by);

create index if not exists idx_organization_members_org_user
  on public.organization_members(organization_id, user_id);

create index if not exists idx_organization_members_user_id
  on public.organization_members(user_id);

create index if not exists idx_organization_members_created_by
  on public.organization_members(created_by);

create index if not exists idx_contacts_organization_id
  on public.contacts(organization_id);

create index if not exists idx_contacts_created_by
  on public.contacts(created_by);

create index if not exists contact_notes_contact_id_idx
  on public.contact_notes(contact_id);

create index if not exists contact_notes_created_at_idx
  on public.contact_notes(created_at desc);

create index if not exists contact_notes_organization_id_idx
  on public.contact_notes(organization_id);

create index if not exists contact_tasks_contact_id_idx
  on public.contact_tasks(contact_id);

create index if not exists contact_tasks_due_at_idx
  on public.contact_tasks(due_at);

create index if not exists contact_tasks_organization_id_idx
  on public.contact_tasks(organization_id);

create index if not exists contact_tasks_status_idx
  on public.contact_tasks(status);

create index if not exists idx_campaigns_organization_id
  on public.campaigns(organization_id);

create index if not exists idx_campaigns_created_by
  on public.campaigns(created_by);

create index if not exists idx_campaign_members_organization_id
  on public.campaign_members(organization_id);

create index if not exists idx_campaign_members_campaign_id
  on public.campaign_members(campaign_id);

create index if not exists idx_campaign_members_contact_id
  on public.campaign_members(contact_id);

create index if not exists idx_campaign_members_status
  on public.campaign_members(organization_id, status);

create index if not exists idx_campaign_members_dial_order
  on public.campaign_members(
    campaign_id,
    status,
    priority desc,
    created_at asc
  );

create index if not exists idx_campaign_members_created_by
  on public.campaign_members(created_by);

create index if not exists idx_calls_organization_id
  on public.calls(organization_id);

create index if not exists idx_calls_campaign_id
  on public.calls(campaign_id);

create index if not exists idx_calls_contact_id
  on public.calls(contact_id);

create index if not exists idx_calls_created_by
  on public.calls(created_by);

create index if not exists idx_recordings_organization_id
  on public.recordings(organization_id);

create index if not exists idx_recordings_call_id
  on public.recordings(call_id);

create index if not exists idx_recordings_created_by
  on public.recordings(created_by);

create index if not exists idx_transcripts_organization_id
  on public.transcripts(organization_id);

create index if not exists idx_transcripts_recording_id
  on public.transcripts(recording_id);

create index if not exists idx_transcripts_created_by
  on public.transcripts(created_by);

create index if not exists idx_notes_organization_id
  on public.notes(organization_id);

create index if not exists idx_notes_contact_id
  on public.notes(contact_id);

create index if not exists idx_notes_call_id
  on public.notes(call_id);

create index if not exists idx_notes_campaign_id
  on public.notes(campaign_id);

create index if not exists idx_notes_recording_id
  on public.notes(recording_id);

create index if not exists idx_notes_created_by
  on public.notes(created_by);

create or replace function public.validate_campaign_member_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  campaign_organization_id uuid;
  contact_organization_id uuid;
begin
  select organization_id
  into campaign_organization_id
  from public.campaigns
  where id = new.campaign_id;

  if campaign_organization_id is null then
    raise exception 'The selected campaign does not exist.';
  end if;

  select organization_id
  into contact_organization_id
  from public.contacts
  where id = new.contact_id;

  if contact_organization_id is null then
    raise exception 'The selected contact does not exist.';
  end if;

  if new.organization_id <> campaign_organization_id then
    raise exception
      'Campaign organization does not match the campaign member organization.';
  end if;

  if new.organization_id <> contact_organization_id then
    raise exception
      'Contact organization does not match the campaign member organization.';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'validate_campaign_member_tenant_trigger'
      and tgrelid = 'public.campaign_members'::regclass
  ) then
    create trigger validate_campaign_member_tenant_trigger
    before insert or update of organization_id, campaign_id, contact_id
    on public.campaign_members
    for each row
    execute function public.validate_campaign_member_tenant();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_campaign_members_updated_at'
      and tgrelid = 'public.campaign_members'::regclass
  ) then
    create trigger set_campaign_members_updated_at
    before update on public.campaign_members
    for each row
    execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  org_id uuid := new.id;
  profile_name text :=
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    );
  org_slug text := 'org-' || new.id::text;
begin
  insert into public.organizations (
    id,
    name,
    slug,
    created_by
  )
  values (
    org_id,
    profile_name,
    org_slug,
    new.id
  )
  on conflict (id) do nothing;

  insert into public.profiles (
    id,
    organization_id,
    email,
    full_name,
    role,
    created_by
  )
  values (
    new.id,
    org_id,
    new.email,
    profile_name,
    'owner',
    new.id
  )
  on conflict (id) do nothing;

  insert into public.organization_members (
    id,
    organization_id,
    user_id,
    role,
    status,
    created_by
  )
  values (
    gen_random_uuid(),
    org_id,
    new.id,
    'owner',
    'active',
    new.id
  )
  on conflict (organization_id, user_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c
      on c.oid = t.tgrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    where t.tgname = 'auth_user_signup_trigger'
      and n.nspname = 'auth'
      and c.relname = 'users'
  ) then
    create trigger auth_user_signup_trigger
    after insert on auth.users
    for each row
    execute function public.handle_new_user_signup();
  end if;
end;
$$;

create or replace view public.total_calls
with (security_invoker = true) as
select
  organization_id,
  count(*) as total_calls
from public.calls
group by organization_id;

create or replace view public.todays_calls
with (security_invoker = true) as
select
  organization_id,
  count(*) as todays_calls
from public.calls
where started_at >= date_trunc('day', now())
group by organization_id;

create or replace view public.total_contacts
with (security_invoker = true) as
select
  organization_id,
  count(*) as total_contacts
from public.contacts
group by organization_id;

create or replace view public.campaign_count
with (security_invoker = true) as
select
  organization_id,
  count(*) as campaign_count
from public.campaigns
group by organization_id;

create or replace view public.average_call_duration
with (security_invoker = true) as
select
  organization_id,
  coalesce(
    avg(duration_seconds),
    0
  ) as average_call_duration_seconds
from public.calls
where duration_seconds is not null
group by organization_id;

create or replace function public.get_total_calls()
returns bigint
language sql
stable
security invoker
as $$
  select coalesce(count(*), 0)
  from public.calls
  where organization_id in (
    select organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.get_todays_calls()
returns bigint
language sql
stable
security invoker
as $$
  select coalesce(count(*), 0)
  from public.calls
  where organization_id in (
    select organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
  )
  and started_at >= date_trunc('day', now());
$$;

create or replace function public.get_total_contacts()
returns bigint
language sql
stable
security invoker
as $$
  select coalesce(count(*), 0)
  from public.contacts
  where organization_id in (
    select organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.get_campaign_count()
returns bigint
language sql
stable
security invoker
as $$
  select coalesce(count(*), 0)
  from public.campaigns
  where organization_id in (
    select organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.get_average_call_duration()
returns numeric
language sql
stable
security invoker
as $$
  select coalesce(avg(duration_seconds), 0)
  from public.calls
  where organization_id in (
    select organization_id
    from public.organization_members
    where user_id = auth.uid()
      and status = 'active'
  )
  and duration_seconds is not null;
$$;