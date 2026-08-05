-- Flowtix Phase 3.4: durable queue waiting, positions, capacity,
-- priorities, reservations, overflow, estimated wait time, and requeue.


alter table public.call_routing_attempts
  drop constraint if exists call_routing_attempts_status_check;
alter table public.call_routing_attempts
  add constraint call_routing_attempts_status_check
  check (status in (
    'created','routing','ringing','queued','overflow','answered',
    'completed','failed','no_agents','cancelled'
  ));

alter table public.call_queues
  add column if not exists priority_mode text not null default 'fifo',
  add column if not exists overflow_queue_id uuid references public.call_queues(id) on delete set null,
  add column if not exists overflow_number text,
  add column if not exists reservation_timeout_seconds integer not null default 30,
  add column if not exists target_answer_seconds integer not null default 20,
  add column if not exists average_handle_seconds integer not null default 300,
  add column if not exists max_requeue_attempts integer not null default 3,
  add column if not exists announce_position boolean not null default true,
  add column if not exists announce_estimated_wait boolean not null default true;

alter table public.call_queues drop constraint if exists call_queues_priority_mode_check;
alter table public.call_queues add constraint call_queues_priority_mode_check
  check (priority_mode in ('fifo','priority'));
alter table public.call_queues drop constraint if exists call_queues_overflow_target_check;
alter table public.call_queues add constraint call_queues_overflow_target_check
  check (not (overflow_queue_id is not null and nullif(btrim(overflow_number), '') is not null));
alter table public.call_queues drop constraint if exists call_queues_queue_limits_check;
alter table public.call_queues add constraint call_queues_queue_limits_check check (
  reservation_timeout_seconds between 5 and 300 and
  target_answer_seconds between 5 and 120 and
  average_handle_seconds between 15 and 14400 and
  max_requeue_attempts between 0 and 20
);

alter table public.queue_members
  add column if not exists max_concurrent_calls integer not null default 1,
  add column if not exists active_reservations integer not null default 0,
  add column if not exists last_reserved_at timestamptz,
  add column if not exists last_completed_at timestamptz,
  add column if not exists handled_count bigint not null default 0;

alter table public.queue_members drop constraint if exists queue_members_capacity_check;
alter table public.queue_members add constraint queue_members_capacity_check
  check (max_concurrent_calls between 1 and 20 and active_reservations >= 0);

create table if not exists public.call_queue_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_id uuid not null references public.call_queues(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  routing_attempt_id uuid references public.call_routing_attempts(id) on delete set null,
  provider text not null,
  provider_call_id text not null,
  status text not null default 'waiting',
  priority integer not null default 0,
  position bigint not null,
  estimated_wait_seconds integer not null default 0,
  requeue_attempts integer not null default 0,
  reserved_user_id uuid references auth.users(id) on delete set null,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  entered_at timestamptz not null default now(),
  answered_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  overflowed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_queue_entries_status_check check (status in (
    'waiting','reserved','connecting','answered','completed','abandoned','overflowed','failed'
  )),
  constraint call_queue_entries_requeue_check check (requeue_attempts >= 0),
  unique (organization_id, provider, provider_call_id)
);

create table if not exists public.call_queue_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_id uuid not null references public.call_queues(id) on delete cascade,
  queue_entry_id uuid not null references public.call_queue_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved',
  provider_child_call_id text,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  answered_at timestamptz,
  released_at timestamptz,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_queue_reservations_status_check check (status in (
    'reserved','connecting','answered','released','expired','failed'
  ))
);

create unique index if not exists call_queue_entries_active_call_idx
  on public.call_queue_entries (organization_id, call_id)
  where status in ('waiting','reserved','connecting','answered');
create index if not exists call_queue_entries_waiting_idx
  on public.call_queue_entries (organization_id, queue_id, status, priority desc, position, entered_at);
create index if not exists call_queue_entries_expiration_idx
  on public.call_queue_entries (organization_id, status, reservation_expires_at)
  where status in ('reserved','connecting');
create unique index if not exists call_queue_reservations_active_entry_idx
  on public.call_queue_reservations (organization_id, queue_entry_id)
  where status in ('reserved','connecting','answered');
create index if not exists call_queue_reservations_user_idx
  on public.call_queue_reservations (organization_id, user_id, status, expires_at);

alter table public.call_queue_entries enable row level security;
alter table public.call_queue_reservations enable row level security;

create policy "Members can view call queue entries" on public.call_queue_entries
for select using (public.is_org_member(organization_id));
create policy "Members can view call queue reservations" on public.call_queue_reservations
for select using (public.is_org_member(organization_id));
create policy "Service role manages call queue entries" on public.call_queue_entries
for all to service_role using (true) with check (true);
create policy "Service role manages call queue reservations" on public.call_queue_reservations
for all to service_role using (true) with check (true);

create sequence if not exists public.call_queue_position_seq;

create or replace function public.refresh_call_queue_positions(
  target_organization uuid,
  target_queue uuid
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  avg_handle integer;
  available_agents integer;
begin
  select average_handle_seconds into avg_handle
  from public.call_queues
  where id = target_queue and organization_id = target_organization;

  select greatest(count(*), 1)::integer into available_agents
  from public.queue_members qm
  join public.agent_presence ap
    on ap.organization_id = qm.organization_id and ap.user_id = qm.user_id
  where qm.organization_id = target_organization
    and qm.queue_id = target_queue
    and qm.is_active = true
    and qm.active_reservations < qm.max_concurrent_calls
    and ap.availability = 'available'
    and ap.activity_state = 'idle'
    and (ap.wrap_up_until is null or ap.wrap_up_until <= now());

  with ranked as (
    select id,
      row_number() over (order by priority desc, position, entered_at) as new_position
    from public.call_queue_entries
    where organization_id = target_organization
      and queue_id = target_queue
      and status = 'waiting'
  )
  update public.call_queue_entries e
  set position = ranked.new_position,
      estimated_wait_seconds = floor(((ranked.new_position - 1) * coalesce(avg_handle,300)) / available_agents)::integer,
      updated_at = now()
  from ranked where e.id = ranked.id;
end;
$$;

create or replace function public.enqueue_call_queue_entry(
  target_organization uuid,
  target_queue uuid,
  target_call uuid,
  target_attempt uuid,
  target_provider text,
  target_provider_call_id text,
  target_priority integer default 0,
  target_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  queue_row public.call_queues%rowtype;
  waiting_count integer;
  created public.call_queue_entries%rowtype;
begin
  select * into queue_row from public.call_queues
  where id = target_queue and organization_id = target_organization and is_active = true
  for update;
  if not found then raise exception 'Queue is unavailable'; end if;

  select count(*) into waiting_count from public.call_queue_entries
  where organization_id = target_organization and queue_id = target_queue
    and status in ('waiting','reserved','connecting');

  if waiting_count >= queue_row.max_size then
    return jsonb_build_object(
      'accepted', false,
      'overflowQueueId', queue_row.overflow_queue_id,
      'overflowNumber', queue_row.overflow_number,
      'reason', 'capacity'
    );
  end if;

  insert into public.call_queue_entries (
    organization_id, queue_id, call_id, routing_attempt_id, provider,
    provider_call_id, priority, position, metadata
  ) values (
    target_organization, target_queue, target_call, target_attempt, target_provider,
    target_provider_call_id, target_priority, nextval('public.call_queue_position_seq'), target_metadata
  )
  on conflict (organization_id, provider, provider_call_id)
  do update set updated_at = now()
  returning * into created;

  perform public.refresh_call_queue_positions(target_organization, target_queue);
  select * into created from public.call_queue_entries where id = created.id;
  return jsonb_build_object(
    'accepted', true,
    'entryId', created.id,
    'position', created.position,
    'estimatedWaitSeconds', created.estimated_wait_seconds,
    'maxWaitSeconds', queue_row.max_wait_seconds,
    'announcePosition', queue_row.announce_position,
    'announceEstimatedWait', queue_row.announce_estimated_wait
  );
end;
$$;

create or replace function public.reserve_next_call_queue_entry(
  target_organization uuid,
  target_queue uuid,
  target_user uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  member_row public.queue_members%rowtype;
  queue_row public.call_queues%rowtype;
  entry_row public.call_queue_entries%rowtype;
  reservation_id uuid;
begin
  select * into member_row from public.queue_members
  where organization_id = target_organization and queue_id = target_queue
    and user_id = target_user and is_active = true
  for update;
  if not found or member_row.active_reservations >= member_row.max_concurrent_calls then
    return jsonb_build_object('reserved', false, 'reason', 'agent_capacity');
  end if;

  select * into queue_row from public.call_queues
  where organization_id = target_organization and id = target_queue and is_active = true;
  if not found then return jsonb_build_object('reserved', false, 'reason', 'queue_unavailable'); end if;

  select * into entry_row from public.call_queue_entries
  where organization_id = target_organization and queue_id = target_queue and status = 'waiting'
  order by case when queue_row.priority_mode = 'priority' then priority else 0 end desc,
           position, entered_at
  for update skip locked limit 1;
  if not found then return jsonb_build_object('reserved', false, 'reason', 'empty'); end if;

  insert into public.call_queue_reservations (
    organization_id, queue_id, queue_entry_id, user_id, expires_at
  ) values (
    target_organization, target_queue, entry_row.id, target_user,
    now() + make_interval(secs => queue_row.reservation_timeout_seconds)
  ) returning id into reservation_id;

  update public.call_queue_entries set
    status = 'reserved', reserved_user_id = target_user, reserved_at = now(),
    reservation_expires_at = now() + make_interval(secs => queue_row.reservation_timeout_seconds),
    updated_at = now()
  where id = entry_row.id;

  update public.queue_members set
    active_reservations = active_reservations + 1,
    last_reserved_at = now()
  where organization_id = target_organization and queue_id = target_queue and user_id = target_user;

  perform public.refresh_call_queue_positions(target_organization, target_queue);
  return jsonb_build_object(
    'reserved', true, 'reservationId', reservation_id, 'entryId', entry_row.id,
    'callId', entry_row.call_id, 'providerCallId', entry_row.provider_call_id
  );
end;
$$;

create or replace function public.release_call_queue_reservation(
  target_organization uuid,
  target_reservation uuid,
  target_reason text,
  should_requeue boolean default true
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  reservation_row public.call_queue_reservations%rowtype;
  entry_row public.call_queue_entries%rowtype;
  queue_row public.call_queues%rowtype;
  next_status text;
begin
  select * into reservation_row from public.call_queue_reservations
  where id = target_reservation and organization_id = target_organization
  for update;
  if not found or reservation_row.status in ('released','expired','failed') then
    return jsonb_build_object('released', false);
  end if;

  select * into entry_row from public.call_queue_entries where id = reservation_row.queue_entry_id for update;
  select * into queue_row from public.call_queues where id = reservation_row.queue_id;

  next_status := case
    when should_requeue and entry_row.requeue_attempts < queue_row.max_requeue_attempts then 'waiting'
    else 'failed'
  end;

  update public.call_queue_reservations set
    status = case when target_reason = 'expired' then 'expired' else 'released' end,
    released_at = now(), release_reason = target_reason, updated_at = now()
  where id = reservation_row.id;

  update public.call_queue_entries set
    status = next_status,
    requeue_attempts = requeue_attempts + case when next_status = 'waiting' then 1 else 0 end,
    reserved_user_id = null, reserved_at = null, reservation_expires_at = null,
    position = case when next_status = 'waiting' then nextval('public.call_queue_position_seq') else position end,
    updated_at = now()
  where id = entry_row.id;

  update public.queue_members set active_reservations = greatest(active_reservations - 1, 0)
  where organization_id = target_organization and queue_id = reservation_row.queue_id
    and user_id = reservation_row.user_id;

  perform public.refresh_call_queue_positions(target_organization, reservation_row.queue_id);
  return jsonb_build_object('released', true, 'entryStatus', next_status);
end;
$$;

create or replace function public.complete_call_queue_reservation(
  target_organization uuid,
  target_reservation uuid,
  target_provider_child_call_id text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  reservation_row public.call_queue_reservations%rowtype;
begin
  select * into reservation_row from public.call_queue_reservations
  where id = target_reservation and organization_id = target_organization for update;
  if not found then return jsonb_build_object('completed', false); end if;

  update public.call_queue_reservations set status = 'answered', answered_at = now(),
    provider_child_call_id = coalesce(target_provider_child_call_id, provider_child_call_id), updated_at = now()
  where id = reservation_row.id;
  update public.call_queue_entries set status = 'answered', answered_at = now(), updated_at = now()
  where id = reservation_row.queue_entry_id;
  update public.queue_members set active_reservations = greatest(active_reservations - 1, 0),
    last_completed_at = now(), handled_count = handled_count + 1
  where organization_id = target_organization and queue_id = reservation_row.queue_id
    and user_id = reservation_row.user_id;
  return jsonb_build_object('completed', true);
end;
$$;

revoke all on function public.refresh_call_queue_positions(uuid,uuid) from public;
revoke all on function public.enqueue_call_queue_entry(uuid,uuid,uuid,uuid,text,text,integer,jsonb) from public;
revoke all on function public.reserve_next_call_queue_entry(uuid,uuid,uuid) from public;
revoke all on function public.release_call_queue_reservation(uuid,uuid,text,boolean) from public;
revoke all on function public.complete_call_queue_reservation(uuid,uuid,text) from public;
grant execute on function public.refresh_call_queue_positions(uuid,uuid) to service_role;
grant execute on function public.enqueue_call_queue_entry(uuid,uuid,uuid,uuid,text,text,integer,jsonb) to service_role;
grant execute on function public.reserve_next_call_queue_entry(uuid,uuid,uuid) to service_role;
grant execute on function public.release_call_queue_reservation(uuid,uuid,text,boolean) to service_role;
grant execute on function public.complete_call_queue_reservation(uuid,uuid,text) to service_role;
