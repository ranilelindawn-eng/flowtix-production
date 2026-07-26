-- CallFlow Phase 2: Twilio browser dialer, inbound routing, queues, recordings and AI insights.

alter table public.calls
  add column if not exists provider text,
  add column if not exists provider_call_sid text,
  add column if not exists provider_child_call_sid text,
  add column if not exists from_number text,
  add column if not exists to_number text,
  add column if not exists ended_at timestamptz;

create unique index if not exists calls_provider_call_sid_unique
  on public.calls(provider_call_sid)
  where provider_call_sid is not null;

create table if not exists public.ring_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  strategy text not null default 'simultaneous' check (strategy in ('simultaneous','sequential')),
  ring_timeout_seconds integer not null default 25 check (ring_timeout_seconds between 5 and 120),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ring_group_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ring_group_id uuid not null references public.ring_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ring_group_id, user_id)
);

create table if not exists public.call_queues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  max_wait_seconds integer not null default 300 check (max_wait_seconds between 30 and 3600),
  max_size integer not null default 50 check (max_size between 1 and 1000),
  hold_music_url text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.queue_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_id uuid not null references public.call_queues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (queue_id, user_id)
);

create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'twilio',
  provider_sid text,
  phone_number text not null unique,
  friendly_name text,
  ring_group_id uuid references public.ring_groups(id) on delete set null,
  queue_id uuid references public.call_queues(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (ring_group_id is not null and queue_id is not null))
);

create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  provider text not null default 'twilio',
  provider_recording_sid text not null unique,
  provider_url text not null,
  status text not null default 'processing',
  duration_seconds integer,
  channels integer,
  storage_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade unique,
  recording_id uuid references public.call_recordings(id) on delete set null,
  provider text not null,
  language text not null default 'en',
  content text not null,
  status text not null default 'completed',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_ai_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade unique,
  summary text not null default '',
  sentiment text not null default 'neutral' check (sentiment in ('positive','neutral','negative','mixed')),
  action_items jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  score integer check (score between 0 and 100),
  provider text not null default 'openai',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ring_groups_org_idx on public.ring_groups(organization_id);
create index if not exists ring_group_members_group_idx on public.ring_group_members(ring_group_id);
create index if not exists call_queues_org_idx on public.call_queues(organization_id);
create index if not exists queue_members_queue_idx on public.queue_members(queue_id);
create index if not exists phone_numbers_org_idx on public.phone_numbers(organization_id);
create index if not exists call_recordings_call_idx on public.call_recordings(call_id);
create index if not exists call_transcripts_call_idx on public.call_transcripts(call_id);
create index if not exists call_ai_insights_call_idx on public.call_ai_insights(call_id);

alter table public.ring_groups enable row level security;
alter table public.ring_group_members enable row level security;
alter table public.call_queues enable row level security;
alter table public.queue_members enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.call_recordings enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.call_ai_insights enable row level security;

-- Tenant-aware CRUD policies. Existing helper functions are defined by CallFlow's base schema.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ring_groups','ring_group_members','call_queues','queue_members',
    'phone_numbers','call_recordings','call_transcripts','call_ai_insights'
  ] loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_insert on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_update on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_delete on public.%I', table_name, table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', table_name, table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_org_writer(organization_id))', table_name, table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id))', table_name, table_name);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_org_admin(organization_id))', table_name, table_name);
  end loop;
end $$;
