begin;

create table if not exists public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_clock_order_check check (
    clocked_out_at is null or clocked_out_at >= clocked_in_at
  )
);

create index if not exists attendance_entries_org_clocked_in_idx
  on public.attendance_entries (organization_id, clocked_in_at desc);

create index if not exists attendance_entries_user_clocked_in_idx
  on public.attendance_entries (user_id, clocked_in_at desc);

create unique index if not exists attendance_entries_one_open_shift_idx
  on public.attendance_entries (organization_id, user_id)
  where clocked_out_at is null;

alter table public.attendance_entries enable row level security;

revoke all on public.attendance_entries from anon;
revoke insert, update, delete on public.attendance_entries from authenticated;
grant select on public.attendance_entries to authenticated;

drop policy if exists attendance_select_authorized on public.attendance_entries;
create policy attendance_select_authorized
on public.attendance_entries
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organization_members manager
    where manager.organization_id = attendance_entries.organization_id
      and manager.user_id = auth.uid()
      and manager.status = 'active'
      and manager.role in ('owner', 'admin')
  )
);

create or replace function public.clock_in_attendance(target_organization_id uuid)
returns public.attendance_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  created_entry public.attendance_entries;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  ) then
    raise exception 'You are not an active member of this organization.';
  end if;

  if exists (
    select 1
    from public.attendance_entries entry
    where entry.organization_id = target_organization_id
      and entry.user_id = auth.uid()
      and entry.clocked_out_at is null
  ) then
    raise exception 'You are already clocked in.';
  end if;

  insert into public.attendance_entries (
    organization_id,
    user_id,
    clocked_in_at
  ) values (
    target_organization_id,
    auth.uid(),
    now()
  )
  returning * into created_entry;

  return created_entry;
end;
$$;

create or replace function public.clock_out_attendance(target_organization_id uuid)
returns public.attendance_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_entry public.attendance_entries;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  update public.attendance_entries
  set
    clocked_out_at = now(),
    updated_at = now()
  where id = (
    select entry.id
    from public.attendance_entries entry
    where entry.organization_id = target_organization_id
      and entry.user_id = auth.uid()
      and entry.clocked_out_at is null
    order by entry.clocked_in_at desc
    limit 1
  )
  returning * into updated_entry;

  if updated_entry.id is null then
    raise exception 'You are not currently clocked in.';
  end if;

  return updated_entry;
end;
$$;

revoke all on function public.clock_in_attendance(uuid) from public;
revoke all on function public.clock_out_attendance(uuid) from public;
grant execute on function public.clock_in_attendance(uuid) to authenticated;
grant execute on function public.clock_out_attendance(uuid) to authenticated;

comment on table public.attendance_entries is
  'Tenant-scoped member time-in and time-out records. Members see their own records; owners and admins see all organization records.';

commit;
