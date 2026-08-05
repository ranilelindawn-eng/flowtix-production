begin;

create table if not exists public.call_control_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  provider text not null default 'twilio',
  conference_name text,
  conference_sid text,
  customer_participant_sid text,
  agent_participant_sid text,
  consult_participant_sid text,
  state text not null default 'preparing',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, call_id),
  constraint call_control_sessions_state_check check (state in ('preparing','active','held','transferring','completed','failed'))
);

create table if not exists public.call_control_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  control_session_id uuid references public.call_control_sessions(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  status text not null default 'completed',
  provider_request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint call_control_events_status_check check (status in ('requested','completed','failed','cancelled'))
);

create table if not exists public.call_supervisor_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  supervisor_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  provider_call_sid text,
  conference_name text,
  status text not null default 'connecting',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_supervisor_sessions_mode_check check (mode in ('monitor','whisper','barge')),
  constraint call_supervisor_sessions_status_check check (status in ('connecting','active','completed','failed'))
);

create index if not exists call_control_sessions_org_call_idx on public.call_control_sessions (organization_id, call_id);
create index if not exists call_control_events_org_call_created_idx on public.call_control_events (organization_id, call_id, created_at desc);
create index if not exists call_supervisor_sessions_org_call_status_idx on public.call_supervisor_sessions (organization_id, call_id, status);

alter table public.call_control_sessions enable row level security;
alter table public.call_control_events enable row level security;
alter table public.call_supervisor_sessions enable row level security;

create policy "organization members can read call control sessions" on public.call_control_sessions
for select using (public.is_organization_member(organization_id));
create policy "organization members can read call control events" on public.call_control_events
for select using (public.is_organization_member(organization_id));
create policy "organization supervisors can read supervisor sessions" on public.call_supervisor_sessions
for select using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.call_control_sessions from anon, authenticated;
revoke insert, update, delete on public.call_control_events from anon, authenticated;
revoke insert, update, delete on public.call_supervisor_sessions from anon, authenticated;

grant select on public.call_control_sessions to authenticated;
grant select on public.call_control_events to authenticated;
grant select on public.call_supervisor_sessions to authenticated;
grant all on public.call_control_sessions to service_role;
grant all on public.call_control_events to service_role;
grant all on public.call_supervisor_sessions to service_role;

commit;
