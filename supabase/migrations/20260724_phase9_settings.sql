-- CallFlow Phase 9: Settings Center
create extension if not exists pgcrypto;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_org_idx on public.api_keys(organization_id, created_at desc);
alter table public.api_keys enable row level security;
drop policy if exists "members view api keys" on public.api_keys;
create policy "members view api keys" on public.api_keys for select using (public.is_organization_member(organization_id));
drop policy if exists "admins manage api keys" on public.api_keys;
create policy "admins manage api keys" on public.api_keys for all using (public.organization_role(organization_id) in ('owner','admin')) with check (public.organization_role(organization_id) in ('owner','admin'));

create table if not exists public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  enabled boolean not null default false,
  status text not null default 'disconnected' check (status in ('disconnected','configured','connected','error')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, provider)
);
alter table public.organization_integrations enable row level security;
drop policy if exists "members view integrations" on public.organization_integrations;
create policy "members view integrations" on public.organization_integrations for select using (public.is_organization_member(organization_id));
drop policy if exists "admins manage integrations" on public.organization_integrations;
create policy "admins manage integrations" on public.organization_integrations for all using (public.organization_role(organization_id) in ('owner','admin')) with check (public.organization_role(organization_id) in ('owner','admin'));

create table if not exists public.organization_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'twilio',
  provider_number_id text,
  phone_number text not null,
  friendly_name text not null,
  capabilities jsonb not null default '{"voice":true,"sms":true}'::jsonb,
  is_default boolean not null default false,
  inbound_route text,
  recording_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, phone_number)
);
create unique index if not exists one_default_phone_per_org on public.organization_phone_numbers(organization_id) where is_default;
alter table public.organization_phone_numbers enable row level security;
drop policy if exists "members view phone numbers" on public.organization_phone_numbers;
create policy "members view phone numbers" on public.organization_phone_numbers for select using (public.is_organization_member(organization_id));
drop policy if exists "admins manage phone numbers" on public.organization_phone_numbers;
create policy "admins manage phone numbers" on public.organization_phone_numbers for all using (public.organization_role(organization_id) in ('owner','admin')) with check (public.organization_role(organization_id) in ('owner','admin'));
