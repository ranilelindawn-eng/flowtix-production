-- Flowtix call-queue customer management.
-- Atomic organization-scoped queue configuration without changing the runtime queue engine.

begin;

revoke all on table public.call_queues from anon;
revoke all on table public.queue_members from anon;
grant select, insert, update, delete on table public.call_queues to authenticated;
grant select, insert, update, delete on table public.queue_members to authenticated;
grant all on table public.call_queues to service_role;
grant all on table public.queue_members to service_role;
alter table public.call_queues enable row level security;
alter table public.queue_members enable row level security;

create or replace function public.create_call_queue_configuration(
  target_organization uuid,
  queue_name text,
  queue_priority_mode text,
  queue_max_wait_seconds integer,
  queue_max_size integer,
  queue_overflow_queue uuid,
  queue_overflow_number text,
  queue_reservation_timeout_seconds integer,
  queue_target_answer_seconds integer,
  queue_average_handle_seconds integer,
  queue_max_requeue_attempts integer,
  queue_announce_position boolean,
  queue_announce_estimated_wait boolean,
  active boolean,
  member_users uuid[]
) returns uuid
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  new_queue_id uuid;
  normalized_name text := nullif(btrim(queue_name), '');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.is_org_admin(target_organization) then raise exception 'Organization admin permission required' using errcode = '42501'; end if;
  if normalized_name is null then raise exception 'Queue name is required'; end if;
  if queue_priority_mode not in ('fifo','priority') then raise exception 'Invalid queue ordering mode'; end if;
  if queue_max_wait_seconds not between 30 and 3600 then raise exception 'Maximum wait must be between 30 and 3600 seconds'; end if;
  if queue_max_size not between 1 and 1000 then raise exception 'Queue capacity must be between 1 and 1000'; end if;
  if queue_reservation_timeout_seconds not between 5 and 300 then raise exception 'Reservation timeout must be between 5 and 300 seconds'; end if;
  if queue_target_answer_seconds not between 5 and 120 then raise exception 'Target answer time must be between 5 and 120 seconds'; end if;
  if queue_average_handle_seconds not between 15 and 14400 then raise exception 'Average handle time must be between 15 and 14400 seconds'; end if;
  if queue_max_requeue_attempts not between 0 and 20 then raise exception 'Maximum requeue attempts must be between 0 and 20'; end if;
  if queue_overflow_queue is not null and nullif(btrim(queue_overflow_number), '') is not null then raise exception 'Choose either an overflow queue or an overflow number, not both'; end if;
  if queue_overflow_queue is not null and not exists (select 1 from public.call_queues q where q.id = queue_overflow_queue and q.organization_id = target_organization) then raise exception 'Overflow queue does not belong to this organization'; end if;
  if exists (select 1 from unnest(coalesce(member_users, '{}'::uuid[])) u where not exists (select 1 from public.organization_members om where om.organization_id = target_organization and om.user_id = u and coalesce(om.status::text, 'active') = 'active')) then raise exception 'One or more selected agents are not active organization members'; end if;

  insert into public.call_queues (
    organization_id, name, max_wait_seconds, max_size, priority_mode,
    overflow_queue_id, overflow_number, reservation_timeout_seconds,
    target_answer_seconds, average_handle_seconds, max_requeue_attempts,
    announce_position, announce_estimated_wait, is_active, created_by
  ) values (
    target_organization, normalized_name, queue_max_wait_seconds, queue_max_size, queue_priority_mode,
    queue_overflow_queue, nullif(btrim(queue_overflow_number), ''), queue_reservation_timeout_seconds,
    queue_target_answer_seconds, queue_average_handle_seconds, queue_max_requeue_attempts,
    coalesce(queue_announce_position, true), coalesce(queue_announce_estimated_wait, true), coalesce(active, true), auth.uid()
  ) returning id into new_queue_id;

  insert into public.queue_members (organization_id, queue_id, user_id, priority, is_active)
  select target_organization, new_queue_id, member_user, member_ordinality - 1, true
  from unnest(coalesce(member_users, '{}'::uuid[])) with ordinality as members(member_user, member_ordinality)
  on conflict (queue_id, user_id) do update set priority = excluded.priority, is_active = true;

  return new_queue_id;
end;
$function$;

create or replace function public.update_call_queue_configuration(
  target_organization uuid,
  target_queue uuid,
  queue_name text,
  queue_priority_mode text,
  queue_max_wait_seconds integer,
  queue_max_size integer,
  queue_overflow_queue uuid,
  queue_overflow_number text,
  queue_reservation_timeout_seconds integer,
  queue_target_answer_seconds integer,
  queue_average_handle_seconds integer,
  queue_max_requeue_attempts integer,
  queue_announce_position boolean,
  queue_announce_estimated_wait boolean,
  active boolean,
  member_users uuid[]
) returns void
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  normalized_name text := nullif(btrim(queue_name), '');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.is_org_admin(target_organization) then raise exception 'Organization admin permission required' using errcode = '42501'; end if;
  if not exists (select 1 from public.call_queues q where q.id = target_queue and q.organization_id = target_organization) then raise exception 'Call queue not found'; end if;
  if normalized_name is null then raise exception 'Queue name is required'; end if;
  if queue_priority_mode not in ('fifo','priority') then raise exception 'Invalid queue ordering mode'; end if;
  if queue_max_wait_seconds not between 30 and 3600 then raise exception 'Maximum wait must be between 30 and 3600 seconds'; end if;
  if queue_max_size not between 1 and 1000 then raise exception 'Queue capacity must be between 1 and 1000'; end if;
  if queue_reservation_timeout_seconds not between 5 and 300 then raise exception 'Reservation timeout must be between 5 and 300 seconds'; end if;
  if queue_target_answer_seconds not between 5 and 120 then raise exception 'Target answer time must be between 5 and 120 seconds'; end if;
  if queue_average_handle_seconds not between 15 and 14400 then raise exception 'Average handle time must be between 15 and 14400 seconds'; end if;
  if queue_max_requeue_attempts not between 0 and 20 then raise exception 'Maximum requeue attempts must be between 0 and 20'; end if;
  if queue_overflow_queue = target_queue then raise exception 'A queue cannot overflow to itself'; end if;
  if queue_overflow_queue is not null and nullif(btrim(queue_overflow_number), '') is not null then raise exception 'Choose either an overflow queue or an overflow number, not both'; end if;
  if queue_overflow_queue is not null and not exists (select 1 from public.call_queues q where q.id = queue_overflow_queue and q.organization_id = target_organization) then raise exception 'Overflow queue does not belong to this organization'; end if;
  if exists (select 1 from unnest(coalesce(member_users, '{}'::uuid[])) u where not exists (select 1 from public.organization_members om where om.organization_id = target_organization and om.user_id = u and coalesce(om.status::text, 'active') = 'active')) then raise exception 'One or more selected agents are not active organization members'; end if;

  update public.call_queues set
    name = normalized_name, priority_mode = queue_priority_mode,
    max_wait_seconds = queue_max_wait_seconds, max_size = queue_max_size,
    overflow_queue_id = queue_overflow_queue, overflow_number = nullif(btrim(queue_overflow_number), ''),
    reservation_timeout_seconds = queue_reservation_timeout_seconds,
    target_answer_seconds = queue_target_answer_seconds,
    average_handle_seconds = queue_average_handle_seconds,
    max_requeue_attempts = queue_max_requeue_attempts,
    announce_position = coalesce(queue_announce_position, true),
    announce_estimated_wait = coalesce(queue_announce_estimated_wait, true),
    is_active = coalesce(active, true), updated_at = now()
  where id = target_queue and organization_id = target_organization;

  delete from public.queue_members qm
  where qm.organization_id = target_organization and qm.queue_id = target_queue
    and not (qm.user_id = any(coalesce(member_users, '{}'::uuid[])));

  insert into public.queue_members (organization_id, queue_id, user_id, priority, is_active)
  select target_organization, target_queue, member_user, member_ordinality - 1, true
  from unnest(coalesce(member_users, '{}'::uuid[])) with ordinality as members(member_user, member_ordinality)
  on conflict (queue_id, user_id) do update set priority = excluded.priority, is_active = true;
end;
$function$;

create or replace function public.delete_call_queue_configuration(
  target_organization uuid,
  target_queue uuid
) returns void
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.is_org_admin(target_organization) then raise exception 'Organization admin permission required' using errcode = '42501'; end if;
  if not exists (select 1 from public.call_queues q where q.id = target_queue and q.organization_id = target_organization) then raise exception 'Call queue not found'; end if;
  if exists (select 1 from public.call_queue_entries e where e.organization_id = target_organization and e.queue_id = target_queue and e.status in ('waiting','reserved','connecting','answered')) then raise exception 'Cannot delete a queue while it has active callers or reservations'; end if;
  delete from public.call_queues where id = target_queue and organization_id = target_organization;
end;
$function$;

revoke all on function public.create_call_queue_configuration(uuid,text,text,integer,integer,uuid,text,integer,integer,integer,integer,boolean,boolean,boolean,uuid[]) from public;
revoke all on function public.update_call_queue_configuration(uuid,uuid,text,text,integer,integer,uuid,text,integer,integer,integer,integer,boolean,boolean,boolean,uuid[]) from public;
revoke all on function public.delete_call_queue_configuration(uuid,uuid) from public;
grant execute on function public.create_call_queue_configuration(uuid,text,text,integer,integer,uuid,text,integer,integer,integer,integer,boolean,boolean,boolean,uuid[]) to authenticated, service_role;
grant execute on function public.update_call_queue_configuration(uuid,uuid,text,text,integer,integer,uuid,text,integer,integer,integer,integer,boolean,boolean,boolean,uuid[]) to authenticated, service_role;
grant execute on function public.delete_call_queue_configuration(uuid,uuid) to authenticated, service_role;

commit;
