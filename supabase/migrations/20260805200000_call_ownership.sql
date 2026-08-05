-- Flowtix Phase 3.5: hardened call ownership, leases, expiration and transfers.

alter table public.calls
  add column if not exists ownership_status text not null default 'unassigned',
  add column if not exists ownership_version bigint not null default 0,
  add column if not exists ownership_acquired_at timestamptz,
  add column if not exists ownership_expires_at timestamptz,
  add column if not exists ownership_transferred_at timestamptz,
  add column if not exists ownership_metadata jsonb not null default '{}'::jsonb;

alter table public.calls drop constraint if exists calls_ownership_status_check;
alter table public.calls add constraint calls_ownership_status_check
  check (ownership_status in ('unassigned','reserved','owned','transferring','released','expired'));

create table if not exists public.call_ownership_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  routing_attempt_id uuid references public.call_routing_attempts(id) on delete set null,
  event_type text not null check (event_type in (
    'reserved','answer_claimed','duplicate_answer_rejected','lease_acquired','lease_renewed',
    'lease_released','lease_expired','transfer_started','transferred','transfer_rejected'
  )),
  from_user_id uuid references auth.users(id) on delete set null,
  to_user_id uuid references auth.users(id) on delete set null,
  ownership_version bigint not null,
  provider_call_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.call_ownership_leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lease_token uuid not null default gen_random_uuid(),
  status text not null default 'active' check (status in ('active','released','expired','superseded')),
  acquired_at timestamptz not null default now(),
  renewed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_ownership_leases_active_call_unique
  on public.call_ownership_leases(call_id) where status = 'active';
create index if not exists calls_ownership_owner_idx
  on public.calls(organization_id, owner_user_id, ownership_status);
create index if not exists calls_ownership_expiry_idx
  on public.calls(organization_id, ownership_expires_at)
  where ownership_expires_at is not null;
create index if not exists call_ownership_events_call_idx
  on public.call_ownership_events(call_id, occurred_at desc);
create index if not exists call_ownership_leases_expiry_idx
  on public.call_ownership_leases(organization_id, status, expires_at);

alter table public.call_ownership_events enable row level security;
alter table public.call_ownership_leases enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['call_ownership_events','call_ownership_leases'] loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_insert on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_update on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_delete on public.%I', table_name, table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', table_name, table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_org_writer(organization_id))', table_name, table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id))', table_name, table_name);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_org_admin(organization_id))', table_name, table_name);
  end loop;
end $$;

create or replace function public.claim_inbound_call_answer(
  target_organization uuid,
  target_attempt uuid,
  target_user uuid,
  child_provider_call_id text default null
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  attempt_row public.call_routing_attempts%rowtype;
  call_row public.calls%rowtype;
  membership_id uuid;
  claimed boolean := false;
begin
  select * into attempt_row from public.call_routing_attempts
  where id = target_attempt and organization_id = target_organization for update;
  if not found then return false; end if;

  select * into call_row from public.calls
  where id = attempt_row.call_id and organization_id = target_organization for update;
  if not found then return false; end if;

  select id into membership_id from public.organization_members
  where organization_id = target_organization and user_id = target_user and status = 'active' limit 1;
  if membership_id is null then return false; end if;

  if attempt_row.answered_by_user_id is not null or call_row.owner_user_id is not null then
    insert into public.call_ownership_events (
      organization_id, call_id, routing_attempt_id, event_type, from_user_id, to_user_id,
      ownership_version, provider_call_id, reason, metadata
    ) values (
      target_organization, call_row.id, target_attempt, 'duplicate_answer_rejected',
      call_row.owner_user_id, target_user, call_row.ownership_version,
      child_provider_call_id, 'call_already_owned', '{}'::jsonb
    );
    return false;
  end if;

  update public.call_routing_attempts set
    answered_by_user_id = target_user, answered_at = coalesce(answered_at, now()),
    status = 'answered', updated_at = now(),
    metadata = metadata || jsonb_build_object('answer_provider_call_id', child_provider_call_id)
  where id = target_attempt;

  update public.calls set
    owner_user_id = target_user,
    owner_membership_id = membership_id,
    ownership_status = 'owned',
    ownership_version = ownership_version + 1,
    ownership_acquired_at = now(),
    ownership_expires_at = null,
    routing_status = 'answered', status = 'connected',
    provider_child_call_sid = coalesce(child_provider_call_id, provider_child_call_sid),
    updated_at = now()
  where id = call_row.id
  returning true into claimed;

  insert into public.call_routing_history (
    organization_id, call_id, routing_attempt_id, event_type,
    from_status, to_status, user_id, provider_call_id
  ) values (
    target_organization, call_row.id, target_attempt, 'answer_claimed',
    'ringing', 'answered', target_user, child_provider_call_id
  );

  insert into public.call_ownership_events (
    organization_id, call_id, routing_attempt_id, event_type, to_user_id,
    ownership_version, provider_call_id
  ) select target_organization, call_row.id, target_attempt, 'answer_claimed', target_user,
           ownership_version, child_provider_call_id
    from public.calls where id = call_row.id;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.acquire_call_ownership_lease(
  target_organization uuid,
  target_call uuid,
  target_user uuid,
  lease_seconds integer default 90,
  target_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare call_row public.calls%rowtype; lease_row public.call_ownership_leases%rowtype;
begin
  perform public.expire_call_ownership_leases(target_organization, target_call);
  select * into call_row from public.calls
  where id = target_call and organization_id = target_organization for update;
  if not found then return jsonb_build_object('acquired', false, 'reason', 'not_found'); end if;
  if call_row.owner_user_id is distinct from target_user then
    return jsonb_build_object('acquired', false, 'reason', 'not_owner');
  end if;

  insert into public.call_ownership_leases (
    organization_id, call_id, user_id, expires_at, metadata
  ) values (
    target_organization, target_call, target_user,
    now() + make_interval(secs => greatest(15, least(lease_seconds, 600))), target_metadata
  ) returning * into lease_row;

  update public.calls set ownership_expires_at = lease_row.expires_at, updated_at = now()
  where id = target_call;
  insert into public.call_ownership_events (
    organization_id, call_id, event_type, to_user_id, ownership_version, metadata
  ) values (
    target_organization, target_call, 'lease_acquired', target_user,
    call_row.ownership_version, jsonb_build_object('leaseId', lease_row.id) || target_metadata
  );
  return jsonb_build_object('acquired', true, 'leaseId', lease_row.id,
    'leaseToken', lease_row.lease_token, 'expiresAt', lease_row.expires_at);
end;
$$;

create or replace function public.renew_call_ownership_lease(
  target_organization uuid, target_lease uuid, target_token uuid, lease_seconds integer default 90
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare lease_row public.call_ownership_leases%rowtype; call_version bigint;
begin
  select * into lease_row from public.call_ownership_leases
  where id = target_lease and organization_id = target_organization and lease_token = target_token
  for update;
  if not found or lease_row.status <> 'active' or lease_row.expires_at <= now() then
    return jsonb_build_object('renewed', false, 'reason', 'invalid_or_expired');
  end if;
  update public.call_ownership_leases set renewed_at = now(),
    expires_at = now() + make_interval(secs => greatest(15, least(lease_seconds, 600))), updated_at = now()
  where id = target_lease returning * into lease_row;
  update public.calls set ownership_expires_at = lease_row.expires_at, updated_at = now()
  where id = lease_row.call_id returning ownership_version into call_version;
  insert into public.call_ownership_events (
    organization_id, call_id, event_type, to_user_id, ownership_version, metadata
  ) values (target_organization, lease_row.call_id, 'lease_renewed', lease_row.user_id,
    coalesce(call_version,0), jsonb_build_object('leaseId', lease_row.id));
  return jsonb_build_object('renewed', true, 'expiresAt', lease_row.expires_at);
end;
$$;

create or replace function public.release_call_ownership_lease(
  target_organization uuid, target_lease uuid, target_token uuid, target_reason text default 'released'
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare lease_row public.call_ownership_leases%rowtype; call_version bigint;
begin
  update public.call_ownership_leases set status = 'released', released_at = now(),
    release_reason = target_reason, updated_at = now()
  where id = target_lease and organization_id = target_organization
    and lease_token = target_token and status = 'active'
  returning * into lease_row;
  if not found then return false; end if;
  update public.calls set ownership_expires_at = null, updated_at = now()
  where id = lease_row.call_id returning ownership_version into call_version;
  insert into public.call_ownership_events (
    organization_id, call_id, event_type, from_user_id, ownership_version, reason
  ) values (target_organization, lease_row.call_id, 'lease_released', lease_row.user_id,
    coalesce(call_version,0), target_reason);
  return true;
end;
$$;

create or replace function public.expire_call_ownership_leases(
  target_organization uuid default null, target_call uuid default null
) returns integer
language plpgsql security definer set search_path = public
as $$
declare expired_count integer := 0; lease_row record;
begin
  for lease_row in
    update public.call_ownership_leases set status = 'expired', released_at = now(),
      release_reason = 'expired', updated_at = now()
    where status = 'active' and expires_at <= now()
      and (target_organization is null or organization_id = target_organization)
      and (target_call is null or call_id = target_call)
    returning *
  loop
    update public.calls set ownership_expires_at = null,
      ownership_status = case when status in ('completed','failed','cancelled') then 'released' else ownership_status end,
      updated_at = now()
    where id = lease_row.call_id;
    insert into public.call_ownership_events (
      organization_id, call_id, event_type, from_user_id, ownership_version, reason
    ) select lease_row.organization_id, lease_row.call_id, 'lease_expired', lease_row.user_id,
      ownership_version, 'expired' from public.calls where id = lease_row.call_id;
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create or replace function public.transfer_call_ownership(
  target_organization uuid,
  target_call uuid,
  acting_user uuid,
  target_user uuid,
  expected_version bigint,
  target_reason text default null,
  target_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare call_row public.calls%rowtype; target_membership uuid; actor_role text;
begin
  select * into call_row from public.calls
  where id = target_call and organization_id = target_organization for update;
  if not found then return jsonb_build_object('transferred', false, 'reason', 'not_found'); end if;
  if call_row.ownership_version <> expected_version then
    return jsonb_build_object('transferred', false, 'reason', 'version_conflict', 'version', call_row.ownership_version);
  end if;
  select role into actor_role from public.organization_members
  where organization_id = target_organization and user_id = acting_user and status = 'active' limit 1;
  if actor_role is null or (call_row.owner_user_id is distinct from acting_user and actor_role not in ('owner','admin','manager')) then
    return jsonb_build_object('transferred', false, 'reason', 'forbidden');
  end if;
  select id into target_membership from public.organization_members
  where organization_id = target_organization and user_id = target_user and status = 'active' limit 1;
  if target_membership is null then return jsonb_build_object('transferred', false, 'reason', 'invalid_target'); end if;

  update public.call_ownership_leases set status = 'superseded', released_at = now(),
    release_reason = 'ownership_transferred', updated_at = now()
  where call_id = target_call and status = 'active';

  update public.calls set owner_user_id = target_user, owner_membership_id = target_membership,
    ownership_status = 'owned', ownership_version = ownership_version + 1,
    ownership_acquired_at = now(), ownership_expires_at = null,
    ownership_transferred_at = now(), ownership_metadata = ownership_metadata || target_metadata,
    updated_at = now()
  where id = target_call returning * into call_row;

  insert into public.call_ownership_events (
    organization_id, call_id, routing_attempt_id, event_type, from_user_id, to_user_id,
    ownership_version, reason, metadata, created_by
  ) values (
    target_organization, target_call, call_row.routing_attempt_id, 'transferred',
    call_row.owner_user_id, target_user, call_row.ownership_version,
    target_reason, target_metadata, acting_user
  );
  return jsonb_build_object('transferred', true, 'version', call_row.ownership_version,
    'ownerUserId', target_user);
end;
$$;

-- Replace the transfer event's source owner using a wrapper-safe trigger value fix.
create or replace function public.transfer_call_ownership(
  target_organization uuid,
  target_call uuid,
  acting_user uuid,
  target_user uuid,
  expected_version bigint,
  target_reason text default null,
  target_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare call_row public.calls%rowtype; previous_owner uuid; target_membership uuid; actor_role text;
begin
  select * into call_row from public.calls where id = target_call and organization_id = target_organization for update;
  if not found then return jsonb_build_object('transferred', false, 'reason', 'not_found'); end if;
  if call_row.ownership_version <> expected_version then return jsonb_build_object('transferred', false, 'reason', 'version_conflict', 'version', call_row.ownership_version); end if;
  previous_owner := call_row.owner_user_id;
  select role into actor_role from public.organization_members where organization_id = target_organization and user_id = acting_user and status = 'active' limit 1;
  if actor_role is null or (previous_owner is distinct from acting_user and actor_role not in ('owner','admin','manager')) then return jsonb_build_object('transferred', false, 'reason', 'forbidden'); end if;
  select id into target_membership from public.organization_members where organization_id = target_organization and user_id = target_user and status = 'active' limit 1;
  if target_membership is null then return jsonb_build_object('transferred', false, 'reason', 'invalid_target'); end if;
  if previous_owner = target_user then return jsonb_build_object('transferred', true, 'version', call_row.ownership_version, 'ownerUserId', target_user); end if;

  update public.call_ownership_leases set status = 'superseded', released_at = now(), release_reason = 'ownership_transferred', updated_at = now()
  where call_id = target_call and status = 'active';
  update public.calls set owner_user_id = target_user, owner_membership_id = target_membership,
    ownership_status = 'owned', ownership_version = ownership_version + 1,
    ownership_acquired_at = now(), ownership_expires_at = null, ownership_transferred_at = now(),
    ownership_metadata = ownership_metadata || target_metadata, updated_at = now()
  where id = target_call returning * into call_row;
  insert into public.call_ownership_events (
    organization_id, call_id, routing_attempt_id, event_type, from_user_id, to_user_id,
    ownership_version, reason, metadata, created_by
  ) values (target_organization, target_call, call_row.routing_attempt_id, 'transferred', previous_owner,
    target_user, call_row.ownership_version, target_reason, target_metadata, acting_user);
  return jsonb_build_object('transferred', true, 'version', call_row.ownership_version, 'ownerUserId', target_user);
end;
$$;

revoke all on function public.claim_inbound_call_answer(uuid,uuid,uuid,text) from public;
revoke all on function public.acquire_call_ownership_lease(uuid,uuid,uuid,integer,jsonb) from public;
revoke all on function public.renew_call_ownership_lease(uuid,uuid,uuid,integer) from public;
revoke all on function public.release_call_ownership_lease(uuid,uuid,uuid,text) from public;
revoke all on function public.expire_call_ownership_leases(uuid,uuid) from public;
revoke all on function public.transfer_call_ownership(uuid,uuid,uuid,uuid,bigint,text,jsonb) from public;
grant execute on function public.claim_inbound_call_answer(uuid,uuid,uuid,text) to service_role;
grant execute on function public.acquire_call_ownership_lease(uuid,uuid,uuid,integer,jsonb) to service_role;
grant execute on function public.renew_call_ownership_lease(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.release_call_ownership_lease(uuid,uuid,uuid,text) to service_role;
grant execute on function public.expire_call_ownership_leases(uuid,uuid) to service_role;
grant execute on function public.transfer_call_ownership(uuid,uuid,uuid,uuid,bigint,text,jsonb) to service_role;

create or replace function public.expire_call_queue_reservations(
  target_organization uuid default null,
  batch_size integer default 100
) returns integer
language plpgsql security definer set search_path = public
as $$
declare reservation_row record; processed integer := 0;
begin
  for reservation_row in
    select id, organization_id from public.call_queue_reservations
    where status = 'active' and expires_at <= now()
      and (target_organization is null or organization_id = target_organization)
    order by expires_at
    for update skip locked
    limit greatest(1, least(batch_size, 500))
  loop
    perform public.release_call_queue_reservation(
      reservation_row.organization_id, reservation_row.id, 'expired', true
    );
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

create or replace function public.finalize_call_ownership(
  target_organization uuid,
  target_call uuid,
  target_reason text default 'call_ended'
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare call_row public.calls%rowtype;
begin
  select * into call_row from public.calls
  where id = target_call and organization_id = target_organization for update;
  if not found then return false; end if;
  update public.call_ownership_leases set status = 'released', released_at = now(),
    release_reason = target_reason, updated_at = now()
  where call_id = target_call and status = 'active';
  update public.calls set ownership_status = 'released', ownership_expires_at = null,
    updated_at = now() where id = target_call;
  insert into public.call_ownership_events (
    organization_id, call_id, routing_attempt_id, event_type, from_user_id,
    ownership_version, reason
  ) values (
    target_organization, target_call, call_row.routing_attempt_id, 'lease_released',
    call_row.owner_user_id, call_row.ownership_version, target_reason
  );
  return true;
end;
$$;

revoke all on function public.expire_call_queue_reservations(uuid,integer) from public;
revoke all on function public.finalize_call_ownership(uuid,uuid,text) from public;
grant execute on function public.expire_call_queue_reservations(uuid,integer) to service_role;
grant execute on function public.finalize_call_ownership(uuid,uuid,text) to service_role;
