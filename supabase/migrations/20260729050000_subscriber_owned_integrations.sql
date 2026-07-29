-- Subscriber-owned integration foundation for CallFlow.
-- Provider tokens are encrypted by the application before storage.

alter table public.organization_integrations
  add column if not exists connected_by uuid references auth.users(id) on delete set null,
  add column if not exists connected_at timestamptz,
  add column if not exists last_error text;

create table if not exists public.organization_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null unique references public.organization_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encrypted_credentials text not null,
  credential_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_integration_secrets_org_idx
  on public.organization_integration_secrets(organization_id);

alter table public.organization_integration_secrets enable row level security;

drop policy if exists "admins manage integration secrets" on public.organization_integration_secrets;
create policy "admins manage integration secrets"
  on public.organization_integration_secrets
  for all
  using (public.organization_role(organization_id) in ('owner','admin'))
  with check (public.organization_role(organization_id) in ('owner','admin'));

revoke all on public.organization_integration_secrets from anon;
grant select, insert, update, delete on public.organization_integration_secrets to authenticated;
