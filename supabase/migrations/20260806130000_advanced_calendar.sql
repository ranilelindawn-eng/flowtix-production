begin;

alter table public.calendar_events
  add column if not exists visibility text not null default 'organization',
  add column if not exists color text not null default '#3b82f6',
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_parent_id uuid references public.calendar_events(id) on delete set null,
  add column if not exists recurrence_series_id uuid,
  add column if not exists reminder_minutes integer[] not null default '{15}',
  add column if not exists attendee_response_required boolean not null default true,
  add column if not exists cancellation_reason text,
  add column if not exists completed_at timestamptz,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists event_version integer not null default 1;

alter table public.calendar_events drop constraint if exists calendar_events_visibility_check;
alter table public.calendar_events add constraint calendar_events_visibility_check
  check (visibility in ('private','team','organization'));
alter table public.calendar_events drop constraint if exists calendar_events_color_check;
alter table public.calendar_events add constraint calendar_events_color_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.calendar_events drop constraint if exists calendar_events_reminder_minutes_check;
alter table public.calendar_events add constraint calendar_events_reminder_minutes_check
  check (array_length(reminder_minutes,1) is null or reminder_minutes <@ array[0,5,10,15,30,60,120,1440]);
alter table public.calendar_events drop constraint if exists calendar_events_event_version_check;
alter table public.calendar_events add constraint calendar_events_event_version_check check (event_version >= 1);
alter table public.calendar_events drop constraint if exists calendar_events_recurrence_self_check;
alter table public.calendar_events add constraint calendar_events_recurrence_self_check
  check (recurrence_parent_id is null or recurrence_parent_id <> id);

create index if not exists calendar_events_org_range_idx on public.calendar_events(organization_id, starts_at, ends_at) where deleted_at is null;
create index if not exists calendar_events_series_idx on public.calendar_events(organization_id, recurrence_series_id, starts_at) where recurrence_series_id is not null;
create index if not exists calendar_events_followup_idx on public.calendar_events(organization_id, status, starts_at) where deleted_at is null;

create table if not exists public.calendar_event_attendees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  attendee_role text not null default 'required' check (attendee_role in ('required','optional','organizer')),
  response_status text not null default 'needs_action' check (response_status in ('needs_action','accepted','declined','tentative')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(calendar_event_id, email)
);

create table if not exists public.calendar_event_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_email text,
  channel text not null default 'in_app' check (channel in ('in_app','email','sms')),
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_user_id is not null or recipient_email is not null)
);

create table if not exists public.calendar_event_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  action text not null check (action in ('created','updated','status_changed','rescheduled','cancelled','deleted','attendee_response')),
  previous_state jsonb,
  new_state jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','boolean','select','multi_select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, field_key)
);

create index if not exists calendar_attendees_event_idx on public.calendar_event_attendees(calendar_event_id, response_status);
create index if not exists calendar_reminders_pending_idx on public.calendar_event_reminders(remind_at) where status='pending';
create index if not exists calendar_history_event_idx on public.calendar_event_history(calendar_event_id, created_at desc);

create or replace function public.validate_calendar_event_relationships()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare parent_org uuid;
begin
  if new.recurrence_parent_id is not null then
    select organization_id into parent_org from public.calendar_events where id=new.recurrence_parent_id;
    if parent_org is distinct from new.organization_id then raise exception 'CALENDAR_RECURRENCE_ORGANIZATION_MISMATCH'; end if;
  end if;
  if new.status='completed' and new.completed_at is null then new.completed_at=now(); end if;
  if tg_op='UPDATE' and old.status='completed' and new.status<>'completed' then new.completed_at=null; end if;
  if tg_op='UPDATE' then new.event_version=old.event_version+1; end if;
  return new;
end $$;

drop trigger if exists calendar_events_validate_advanced on public.calendar_events;
create trigger calendar_events_validate_advanced before insert or update on public.calendar_events
for each row execute function public.validate_calendar_event_relationships();

create or replace function public.record_calendar_event_history()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare action_name text;
begin
  if tg_op='INSERT' then action_name='created';
  elsif tg_op='DELETE' then action_name='deleted';
  elsif old.status is distinct from new.status then action_name=case when new.status='cancelled' then 'cancelled' else 'status_changed' end;
  elsif old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at then action_name='rescheduled';
  else action_name='updated'; end if;
  insert into public.calendar_event_history(organization_id,calendar_event_id,action,previous_state,new_state,actor_user_id)
  values(coalesce(new.organization_id,old.organization_id),coalesce(new.id,old.id),action_name,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end, auth.uid());
  return coalesce(new,old);
end $$;

drop trigger if exists calendar_events_history on public.calendar_events;
create trigger calendar_events_history after insert or update or delete on public.calendar_events
for each row execute function public.record_calendar_event_history();

create or replace function public.find_calendar_conflicts(p_organization_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_owner_id uuid default null,p_exclude_event_id uuid default null)
returns table(id uuid,title text,starts_at timestamptz,ends_at timestamptz,owner_id uuid)
language sql security definer set search_path=public,pg_catalog as $$
 select e.id,e.title,e.starts_at,e.ends_at,e.owner_id from public.calendar_events e
 where e.organization_id=p_organization_id and e.deleted_at is null and e.status not in ('cancelled','completed')
 and (p_exclude_event_id is null or e.id<>p_exclude_event_id)
 and (p_owner_id is null or e.owner_id=p_owner_id)
 and e.starts_at < p_ends_at and e.ends_at > p_starts_at
 and public.is_org_member(p_organization_id)
 order by e.starts_at limit 50;
$$;

alter table public.calendar_event_attendees enable row level security;
alter table public.calendar_event_reminders enable row level security;
alter table public.calendar_event_history enable row level security;
alter table public.calendar_field_definitions enable row level security;

create policy calendar_attendees_select on public.calendar_event_attendees for select to authenticated using(public.is_org_member(organization_id));
create policy calendar_attendees_manage on public.calendar_event_attendees for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy calendar_reminders_select on public.calendar_event_reminders for select to authenticated using(public.is_org_member(organization_id));
create policy calendar_reminders_manage on public.calendar_event_reminders for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy calendar_history_select on public.calendar_event_history for select to authenticated using(public.is_org_member(organization_id));
create policy calendar_fields_select on public.calendar_field_definitions for select to authenticated using(public.is_org_member(organization_id));
create policy calendar_fields_manage on public.calendar_field_definitions for all to authenticated
using (exists (select 1 from public.organization_members member where member.organization_id=calendar_field_definitions.organization_id and member.user_id=auth.uid() and member.status='active' and member.role in ('owner','admin','manager')))
with check (exists (select 1 from public.organization_members member where member.organization_id=calendar_field_definitions.organization_id and member.user_id=auth.uid() and member.status='active' and member.role in ('owner','admin','manager')));

revoke insert,update,delete on public.calendar_event_history from authenticated;
grant select,insert,update,delete on public.calendar_event_attendees,public.calendar_event_reminders,public.calendar_field_definitions to authenticated;
grant select on public.calendar_event_history to authenticated;
grant execute on function public.find_calendar_conflicts(uuid,timestamptz,timestamptz,uuid,uuid) to authenticated;
grant all on public.calendar_event_attendees,public.calendar_event_reminders,public.calendar_event_history,public.calendar_field_definitions to service_role;

notify pgrst,'reload schema';
commit;
