-- Flowtix Phase B.6: telephony operational maintenance, stale-state recovery,
-- existing-data integrity reporting, and queue reservation expiration correction.

create or replace function public.expire_call_queue_reservations(
  target_organization uuid default null,
  batch_size integer default 100
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row record;
  processed integer := 0;
begin
  for reservation_row in
    select id, organization_id
    from public.call_queue_reservations
    where status in ('reserved', 'connecting')
      and expires_at <= now()
      and (target_organization is null or organization_id = target_organization)
    order by expires_at, id
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 100), 500))
  loop
    perform public.release_call_queue_reservation(
      reservation_row.organization_id,
      reservation_row.id,
      'expired',
      true
    );
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

create or replace function public.telephony_integrity_report(
  target_organization uuid default null
) returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'organizationId', target_organization,
    'expiredActiveReservations', (
      select count(*) from public.call_queue_reservations r
      where r.status in ('reserved', 'connecting')
        and r.expires_at <= now()
        and (target_organization is null or r.organization_id = target_organization)
    ),
    'staleOnlineDevices', (
      select count(*) from public.agent_devices d
      where d.status = 'online'
        and coalesce(d.last_heartbeat_at, d.updated_at, d.created_at) <= now() - interval '2 minutes'
        and (target_organization is null or d.organization_id = target_organization)
    ),
    'staleAvailablePresence', (
      select count(*) from public.agent_presence p
      where p.availability = 'available'
        and coalesce(p.last_seen_at, p.updated_at, p.created_at) <= now() - interval '2 minutes'
        and not exists (
          select 1 from public.agent_devices d
          where d.organization_id = p.organization_id
            and d.user_id = p.user_id
            and d.status = 'online'
            and d.supports_inbound = true
            and d.last_heartbeat_at > now() - interval '90 seconds'
        )
        and (target_organization is null or p.organization_id = target_organization)
    ),
    'expiredWrapUpPresence', (
      select count(*) from public.agent_presence p
      where p.activity_state = 'wrap_up'
        and p.wrap_up_until is not null
        and p.wrap_up_until <= now()
        and (target_organization is null or p.organization_id = target_organization)
    ),
    'staleWaitingQueueEntries', (
      select count(*)
      from public.call_queue_entries e
      join public.call_queues q
        on q.id = e.queue_id and q.organization_id = e.organization_id
      where e.status = 'waiting'
        and e.entered_at + make_interval(secs => q.max_wait_seconds) <= now()
        and (target_organization is null or e.organization_id = target_organization)
    ),
    'queueMemberReservationDrift', (
      select count(*)
      from public.queue_members qm
      where qm.active_reservations <> (
        select count(*)::integer
        from public.call_queue_reservations r
        where r.organization_id = qm.organization_id
          and r.queue_id = qm.queue_id
          and r.user_id = qm.user_id
          and r.status in ('reserved', 'connecting')
      )
      and (target_organization is null or qm.organization_id = target_organization)
    )
  );
$$;

create or replace function public.maintain_telephony_runtime(
  target_organization uuid default null,
  batch_size integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_batch integer := greatest(1, least(coalesce(batch_size, 100), 500));
  expired_reservations integer := 0;
  offline_devices integer := 0;
  recovered_presence integer := 0;
  expired_wrap_up integer := 0;
  abandoned_entries integer := 0;
  reconciled_members integer := 0;
  queue_row record;
begin
  expired_reservations := public.expire_call_queue_reservations(
    target_organization,
    effective_batch
  );

  with stale as (
    select id
    from public.agent_devices
    where status = 'online'
      and coalesce(last_heartbeat_at, updated_at, created_at) <= now() - interval '2 minutes'
      and (target_organization is null or organization_id = target_organization)
    order by coalesce(last_heartbeat_at, updated_at, created_at), id
    for update skip locked
    limit effective_batch
  )
  update public.agent_devices d
  set status = 'offline',
      current_call_id = null,
      disconnected_at = coalesce(disconnected_at, now()),
      updated_at = now()
  from stale
  where d.id = stale.id;
  get diagnostics offline_devices = row_count;

  update public.agent_presence p
  set availability = 'offline',
      activity_state = case
        when p.activity_state in ('idle', 'wrap_up') then 'idle'
        else p.activity_state
      end,
      wrap_up_until = case
        when p.activity_state in ('idle', 'wrap_up') then null
        else p.wrap_up_until
      end,
      updated_at = now()
  where p.availability = 'available'
    and p.activity_state in ('idle', 'wrap_up')
    and coalesce(p.last_seen_at, p.updated_at, p.created_at) <= now() - interval '2 minutes'
    and not exists (
      select 1 from public.agent_devices d
      where d.organization_id = p.organization_id
        and d.user_id = p.user_id
        and d.status = 'online'
        and d.supports_inbound = true
        and d.last_heartbeat_at > now() - interval '90 seconds'
    )
    and (target_organization is null or p.organization_id = target_organization);
  get diagnostics recovered_presence = row_count;

  update public.agent_presence p
  set activity_state = 'idle',
      wrap_up_until = null,
      active_call_id = null,
      updated_at = now()
  where p.activity_state = 'wrap_up'
    and p.wrap_up_until is not null
    and p.wrap_up_until <= now()
    and (target_organization is null or p.organization_id = target_organization);
  get diagnostics expired_wrap_up = row_count;

  with stale_entries as (
    select e.id
    from public.call_queue_entries e
    join public.call_queues q
      on q.id = e.queue_id and q.organization_id = e.organization_id
    where e.status = 'waiting'
      and e.entered_at + make_interval(secs => q.max_wait_seconds) <= now()
      and (target_organization is null or e.organization_id = target_organization)
    order by e.entered_at, e.id
    for update of e skip locked
    limit effective_batch
  )
  update public.call_queue_entries e
  set status = 'abandoned',
      abandoned_at = coalesce(abandoned_at, now()),
      updated_at = now(),
      metadata = e.metadata || jsonb_build_object('maintenanceReason', 'max_wait_exceeded')
  from stale_entries
  where e.id = stale_entries.id;
  get diagnostics abandoned_entries = row_count;

  with expected as (
    select qm.organization_id, qm.queue_id, qm.user_id,
      (
        select count(*)::integer
        from public.call_queue_reservations r
        where r.organization_id = qm.organization_id
          and r.queue_id = qm.queue_id
          and r.user_id = qm.user_id
          and r.status in ('reserved', 'connecting')
      ) as active_count
    from public.queue_members qm
    where target_organization is null or qm.organization_id = target_organization
  )
  update public.queue_members qm
  set active_reservations = expected.active_count
  from expected
  where qm.organization_id = expected.organization_id
    and qm.queue_id = expected.queue_id
    and qm.user_id = expected.user_id
    and qm.active_reservations <> expected.active_count;
  get diagnostics reconciled_members = row_count;

  for queue_row in
    select distinct e.organization_id, e.queue_id
    from public.call_queue_entries e
    where e.status = 'waiting'
      and (target_organization is null or e.organization_id = target_organization)
  loop
    perform public.refresh_call_queue_positions(queue_row.organization_id, queue_row.queue_id);
  end loop;

  return jsonb_build_object(
    'processedAt', now(),
    'expiredQueueReservations', expired_reservations,
    'offlineDevices', offline_devices,
    'recoveredPresence', recovered_presence,
    'expiredWrapUpPresence', expired_wrap_up,
    'abandonedQueueEntries', abandoned_entries,
    'reconciledQueueMembers', reconciled_members,
    'integrity', public.telephony_integrity_report(target_organization)
  );
end;
$$;

revoke all on function public.expire_call_queue_reservations(uuid, integer) from public, anon, authenticated;
revoke all on function public.telephony_integrity_report(uuid) from public, anon, authenticated;
revoke all on function public.maintain_telephony_runtime(uuid, integer) from public, anon, authenticated;

grant execute on function public.expire_call_queue_reservations(uuid, integer) to service_role;
grant execute on function public.telephony_integrity_report(uuid) to service_role;
grant execute on function public.maintain_telephony_runtime(uuid, integer) to service_role;
