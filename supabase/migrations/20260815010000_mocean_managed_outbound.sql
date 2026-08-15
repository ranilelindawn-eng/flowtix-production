begin;

-- Flowtix managed outbound calling keeps the carrier credential at platform
-- level while each authenticated agent stores only the phone that should ring
-- first. This is deliberately separate from organization_phone_numbers so it
-- does not change or weaken the existing inbound/provider-owned number model.
create table if not exists public.telephony_agent_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  callback_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telephony_agent_settings_org_user_unique unique (organization_id, user_id),
  constraint telephony_agent_settings_callback_e164_check
    check (callback_number ~ '^\+[1-9][0-9]{7,14}$')
);

create index if not exists telephony_agent_settings_user_org_idx
  on public.telephony_agent_settings(user_id, organization_id);

alter table public.telephony_agent_settings enable row level security;

drop policy if exists "members read own managed calling settings" on public.telephony_agent_settings;
create policy "members read own managed calling settings"
  on public.telephony_agent_settings
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

drop policy if exists "members manage own managed calling settings" on public.telephony_agent_settings;
create policy "members manage own managed calling settings"
  on public.telephony_agent_settings
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

-- Explicit service-role access is required by the server-side managed calling
-- routes. No anonymous access is granted.
grant select, insert, update, delete on public.telephony_agent_settings to authenticated;
grant all on public.telephony_agent_settings to service_role;

commit;
