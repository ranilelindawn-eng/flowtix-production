begin;

alter table public.contact_tasks
  add column if not exists task_type text not null default 'follow_up',
  add column if not exists source text not null default 'manual',
  add column if not exists start_at timestamptz,
  add column if not exists reminder_at timestamptz,
  add column if not exists estimated_minutes integer,
  add column if not exists actual_minutes integer,
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_parent_id uuid references public.contact_tasks(id) on delete set null,
  add column if not exists outcome text,
  add column if not exists blocked_reason text,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.contact_tasks drop constraint if exists contact_tasks_task_type_check;
alter table public.contact_tasks add constraint contact_tasks_task_type_check
  check (task_type in ('follow_up','call','email','meeting','research','internal','other'));
alter table public.contact_tasks drop constraint if exists contact_tasks_source_check;
alter table public.contact_tasks add constraint contact_tasks_source_check
  check (source in ('manual','ai','sequence','campaign','automation','import','system'));
alter table public.contact_tasks drop constraint if exists contact_tasks_estimated_minutes_check;
alter table public.contact_tasks add constraint contact_tasks_estimated_minutes_check
  check (estimated_minutes is null or estimated_minutes between 1 and 10080);
alter table public.contact_tasks drop constraint if exists contact_tasks_actual_minutes_check;
alter table public.contact_tasks add constraint contact_tasks_actual_minutes_check
  check (actual_minutes is null or actual_minutes between 0 and 10080);
alter table public.contact_tasks drop constraint if exists contact_tasks_dates_check;
alter table public.contact_tasks add constraint contact_tasks_dates_check
  check (start_at is null or due_at is null or start_at <= due_at);
alter table public.contact_tasks drop constraint if exists contact_tasks_recurrence_self_check;
alter table public.contact_tasks add constraint contact_tasks_recurrence_self_check
  check (recurrence_parent_id is null or recurrence_parent_id <> id);

create index if not exists contact_tasks_org_status_due_idx
  on public.contact_tasks (organization_id, status, due_at);
create index if not exists contact_tasks_org_assignee_status_idx
  on public.contact_tasks (organization_id, assigned_to, status);
create index if not exists contact_tasks_org_type_idx
  on public.contact_tasks (organization_id, task_type);
create index if not exists contact_tasks_org_reminder_idx
  on public.contact_tasks (organization_id, reminder_at)
  where reminder_at is not null and status = 'pending';
create index if not exists contact_tasks_recurrence_parent_idx
  on public.contact_tasks (recurrence_parent_id)
  where recurrence_parent_id is not null;

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.contact_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.contact_tasks(id) on delete cascade,
  dependency_type text not null default 'finish_to_start',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint task_dependencies_no_self check (task_id <> depends_on_task_id),
  constraint task_dependencies_type_check check (dependency_type in ('finish_to_start','start_to_start')),
  constraint task_dependencies_unique unique (organization_id, task_id, depends_on_task_id)
);

create index if not exists task_dependencies_task_idx
  on public.task_dependencies (organization_id, task_id);
create index if not exists task_dependencies_parent_idx
  on public.task_dependencies (organization_id, depends_on_task_id);

create table if not exists public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.contact_tasks(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_status_history_task_idx
  on public.task_status_history (organization_id, task_id, created_at desc);

create table if not exists public.task_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null,
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_field_definitions_type_check check (field_type in ('text','number','date','boolean','select','multi_select')),
  constraint task_field_definitions_key_check check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint task_field_definitions_unique unique (organization_id, field_key)
);

create index if not exists task_field_definitions_org_idx
  on public.task_field_definitions (organization_id, is_active, position);

create or replace function public.validate_task_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  related_org uuid;
begin
  if new.recurrence_parent_id is not null then
    select organization_id into related_org from public.contact_tasks where id = new.recurrence_parent_id;
    if related_org is distinct from new.organization_id then
      raise exception 'TASK_RECURRENCE_ORGANIZATION_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_task_relationships_trigger on public.contact_tasks;
create trigger validate_task_relationships_trigger
before insert or update of recurrence_parent_id, organization_id on public.contact_tasks
for each row execute function public.validate_task_relationships();

create or replace function public.validate_task_dependency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_org uuid;
  parent_org uuid;
begin
  select organization_id into task_org from public.contact_tasks where id = new.task_id;
  select organization_id into parent_org from public.contact_tasks where id = new.depends_on_task_id;
  if task_org is null or parent_org is null or task_org <> new.organization_id or parent_org <> new.organization_id then
    raise exception 'TASK_DEPENDENCY_ORGANIZATION_MISMATCH';
  end if;
  if exists (
    select 1 from public.task_dependencies d
    where d.organization_id = new.organization_id
      and d.task_id = new.depends_on_task_id
      and d.depends_on_task_id = new.task_id
      and d.id is distinct from new.id
  ) then
    raise exception 'TASK_DEPENDENCY_CYCLE';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_task_dependency_trigger on public.task_dependencies;
create trigger validate_task_dependency_trigger
before insert or update on public.task_dependencies
for each row execute function public.validate_task_dependency();

create or replace function public.normalize_contact_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
      new.cancelled_at := null;
    elsif new.status = 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
      new.completed_at := null;
      new.completed_by := null;
    else
      new.completed_at := null;
      new.completed_by := null;
      new.cancelled_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_contact_task_status_trigger on public.contact_tasks;
create trigger normalize_contact_task_status_trigger
before update of status on public.contact_tasks
for each row execute function public.normalize_contact_task_status();

create or replace function public.record_contact_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_status_history (organization_id, task_id, previous_status, new_status, changed_by)
    values (new.organization_id, new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.task_status_history (organization_id, task_id, previous_status, new_status, changed_by)
    values (new.organization_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists track_contact_task_status_before on public.contact_tasks;
drop trigger if exists record_contact_task_status_trigger on public.contact_tasks;
create trigger record_contact_task_status_trigger
after insert or update of status on public.contact_tasks
for each row execute function public.record_contact_task_status();

alter table public.task_dependencies enable row level security;
alter table public.task_status_history enable row level security;
alter table public.task_field_definitions enable row level security;

drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists task_dependencies_insert on public.task_dependencies;
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
with check (public.is_organization_member(organization_id) and created_by = auth.uid());
drop policy if exists task_dependencies_delete on public.task_dependencies;
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists task_status_history_select on public.task_status_history;
create policy task_status_history_select on public.task_status_history for select to authenticated
using (public.is_organization_member(organization_id));
revoke insert, update, delete on public.task_status_history from authenticated;

drop policy if exists task_field_definitions_select on public.task_field_definitions;
create policy task_field_definitions_select on public.task_field_definitions for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists task_field_definitions_manage on public.task_field_definitions;
create policy task_field_definitions_manage on public.task_field_definitions for all to authenticated
using (public.can_manage_organization_assignments(organization_id))
with check (public.can_manage_organization_assignments(organization_id));

grant select, insert, delete on public.task_dependencies to authenticated;
grant select on public.task_status_history to authenticated;
grant select, insert, update, delete on public.task_field_definitions to authenticated;

commit;
