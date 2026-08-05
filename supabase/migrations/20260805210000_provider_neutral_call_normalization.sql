begin;

alter table public.calls
  add column if not exists provider_parent_call_id text,
  add column if not exists provider_event_at timestamptz,
  add column if not exists provider_status_raw text;

create index if not exists calls_provider_parent_call_idx
  on public.calls (organization_id, provider, provider_parent_call_id)
  where provider_parent_call_id is not null;

create table if not exists public.telephony_provider_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('twilio','telnyx','signalwire','plivo')),
  provider_event_id text not null,
  event_type text not null check (event_type in ('call.status','recording.status')),
  provider_call_id text,
  provider_parent_call_id text,
  provider_recording_id text,
  normalized_status text,
  raw_status text not null default '',
  occurred_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, provider_event_id)
);

create index if not exists telephony_provider_events_call_idx
  on public.telephony_provider_events (organization_id, provider, provider_call_id, occurred_at desc);
create index if not exists telephony_provider_events_recording_idx
  on public.telephony_provider_events (organization_id, provider, provider_recording_id)
  where provider_recording_id is not null;

alter table public.telephony_provider_events enable row level security;

drop policy if exists telephony_provider_events_member_read on public.telephony_provider_events;
create policy telephony_provider_events_member_read on public.telephony_provider_events
for select to authenticated
using (exists (
  select 1 from public.organization_members member
  where member.organization_id = telephony_provider_events.organization_id
    and member.user_id = auth.uid() and member.status = 'active'
));

revoke insert, update, delete on public.telephony_provider_events from anon, authenticated;
grant select on public.telephony_provider_events to authenticated;
grant all on public.telephony_provider_events to service_role;

commit;
