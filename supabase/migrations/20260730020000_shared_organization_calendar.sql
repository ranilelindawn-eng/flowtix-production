begin;

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'meeting'
    check (event_type in ('meeting','demo','call','task','internal')),
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  all_day boolean not null default false,
  location text,
  meeting_provider text not null default 'none'
    check (meeting_provider in ('none','zoom','teams','custom')),
  external_meeting_id text,
  meeting_url text,
  host_url text,
  meeting_password text,
  google_event_id text,
  google_event_url text,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  attendee_emails text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_valid_range check (ends_at > starts_at)
);

create index if not exists calendar_events_org_start_idx
  on public.calendar_events (organization_id, starts_at);
create index if not exists calendar_events_owner_idx
  on public.calendar_events (organization_id, owner_id, starts_at);
create index if not exists calendar_events_contact_idx
  on public.calendar_events (contact_id) where contact_id is not null;

alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_select_members on public.calendar_events;
create policy calendar_events_select_members
on public.calendar_events for select
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = calendar_events.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
);

drop policy if exists calendar_events_insert_members on public.calendar_events;
create policy calendar_events_insert_members
on public.calendar_events for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.organization_members member
    where member.organization_id = calendar_events.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
);

drop policy if exists calendar_events_update_authorized on public.calendar_events;
create policy calendar_events_update_authorized
on public.calendar_events for update
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = calendar_events.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role in ('owner','admin','manager')
        or calendar_events.created_by = auth.uid()
        or calendar_events.owner_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = calendar_events.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role in ('owner','admin','manager')
        or calendar_events.created_by = auth.uid()
        or calendar_events.owner_id = auth.uid()
      )
  )
);

drop policy if exists calendar_events_delete_authorized on public.calendar_events;
create policy calendar_events_delete_authorized
on public.calendar_events for delete
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = calendar_events.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role in ('owner','admin')
        or calendar_events.created_by = auth.uid()
        or calendar_events.owner_id = auth.uid()
      )
  )
);

grant select, insert, update, delete on public.calendar_events to authenticated;

commit;
