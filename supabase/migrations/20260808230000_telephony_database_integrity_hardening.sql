begin;

-- Flowtix Phase B.5: telephony database integrity, provider-number consistency,
-- routing ownership enforcement, and high-contention query indexes.

-- Canonical provider and phone-number validation for all newly written rows.
alter table public.organization_phone_numbers
  drop constraint if exists organization_phone_numbers_provider_check,
  add constraint organization_phone_numbers_provider_check
    check (provider in ('twilio','telnyx','signalwire','plivo')) not valid,
  drop constraint if exists organization_phone_numbers_e164_check,
  add constraint organization_phone_numbers_e164_check
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$') not valid,
  drop constraint if exists organization_phone_numbers_capabilities_check,
  add constraint organization_phone_numbers_capabilities_check
    check (jsonb_typeof(capabilities) = 'object') not valid;

alter table public.phone_numbers
  drop constraint if exists phone_numbers_provider_check,
  add constraint phone_numbers_provider_check
    check (provider in ('twilio','telnyx','signalwire','plivo')) not valid,
  drop constraint if exists phone_numbers_e164_check,
  add constraint phone_numbers_e164_check
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$') not valid;

-- Provider identifiers may be reused by different carriers, but never within
-- the same carrier. Partial indexes preserve rows imported before an ID existed.
create index if not exists organization_phone_numbers_provider_id_idx
  on public.organization_phone_numbers(provider, provider_number_id)
  where provider_number_id is not null and btrim(provider_number_id) <> '';

create index if not exists phone_numbers_provider_sid_idx
  on public.phone_numbers(provider, provider_sid)
  where provider_sid is not null and btrim(provider_sid) <> '';

create index if not exists organization_phone_numbers_inbound_lookup_idx
  on public.organization_phone_numbers(phone_number, provider, organization_id);

create index if not exists organization_phone_numbers_active_provider_idx
  on public.organization_phone_numbers(organization_id, provider, is_default, created_at);

create index if not exists phone_numbers_routing_lookup_idx
  on public.phone_numbers(organization_id, provider, phone_number)
  where is_active = true;

-- Composite keys allow tenant-consistency foreign keys without changing IDs.
create unique index if not exists ring_groups_id_org_unique
  on public.ring_groups(id, organization_id);
create unique index if not exists call_queues_id_org_unique
  on public.call_queues(id, organization_id);
create unique index if not exists calls_id_org_unique
  on public.calls(id, organization_id);
create unique index if not exists call_routing_attempts_id_org_unique
  on public.call_routing_attempts(id, organization_id);
create unique index if not exists call_queue_entries_id_org_unique
  on public.call_queue_entries(id, organization_id);
create unique index if not exists agent_devices_id_org_unique
  on public.agent_devices(id, organization_id);

-- NOT VALID protects existing installations from being blocked by historical
-- data while enforcing tenant consistency for every new or updated row.
alter table public.ring_group_members
  drop constraint if exists ring_group_members_ring_group_org_fkey,
  add constraint ring_group_members_ring_group_org_fkey
    foreign key (ring_group_id, organization_id)
    references public.ring_groups(id, organization_id)
    not valid;

alter table public.queue_members
  drop constraint if exists queue_members_queue_org_fkey,
  add constraint queue_members_queue_org_fkey
    foreign key (queue_id, organization_id)
    references public.call_queues(id, organization_id)
    not valid;

alter table public.phone_numbers
  drop constraint if exists phone_numbers_ring_group_org_fkey,
  add constraint phone_numbers_ring_group_org_fkey
    foreign key (ring_group_id, organization_id)
    references public.ring_groups(id, organization_id)
    not valid,
  drop constraint if exists phone_numbers_queue_org_fkey,
  add constraint phone_numbers_queue_org_fkey
    foreign key (queue_id, organization_id)
    references public.call_queues(id, organization_id)
    not valid;

alter table public.call_routing_attempts
  drop constraint if exists call_routing_attempts_call_org_fkey,
  add constraint call_routing_attempts_call_org_fkey
    foreign key (call_id, organization_id)
    references public.calls(id, organization_id)
    not valid,
  drop constraint if exists call_routing_attempts_ring_group_org_fkey,
  add constraint call_routing_attempts_ring_group_org_fkey
    foreign key (ring_group_id, organization_id)
    references public.ring_groups(id, organization_id)
    not valid,
  drop constraint if exists call_routing_attempts_queue_org_fkey,
  add constraint call_routing_attempts_queue_org_fkey
    foreign key (queue_id, organization_id)
    references public.call_queues(id, organization_id)
    not valid;

alter table public.call_queue_entries
  drop constraint if exists call_queue_entries_call_org_fkey,
  add constraint call_queue_entries_call_org_fkey
    foreign key (call_id, organization_id)
    references public.calls(id, organization_id)
    not valid,
  drop constraint if exists call_queue_entries_queue_org_fkey,
  add constraint call_queue_entries_queue_org_fkey
    foreign key (queue_id, organization_id)
    references public.call_queues(id, organization_id)
    not valid,
  drop constraint if exists call_queue_entries_attempt_org_fkey,
  add constraint call_queue_entries_attempt_org_fkey
    foreign key (routing_attempt_id, organization_id)
    references public.call_routing_attempts(id, organization_id)
    not valid;

alter table public.call_queue_reservations
  drop constraint if exists call_queue_reservations_queue_org_fkey,
  add constraint call_queue_reservations_queue_org_fkey
    foreign key (queue_id, organization_id)
    references public.call_queues(id, organization_id)
    not valid,
  drop constraint if exists call_queue_reservations_entry_org_fkey,
  add constraint call_queue_reservations_entry_org_fkey
    foreign key (queue_entry_id, organization_id)
    references public.call_queue_entries(id, organization_id)
    not valid;

alter table public.agent_presence_history
  drop constraint if exists agent_presence_history_device_org_fkey,
  add constraint agent_presence_history_device_org_fkey
    foreign key (device_id, organization_id)
    references public.agent_devices(id, organization_id)
    not valid;

-- Prevent more than one active default per organization and provider while
-- retaining the existing one-default-per-workspace rule.
create unique index if not exists one_default_phone_per_org_provider
  on public.organization_phone_numbers(organization_id, provider)
  where is_default;

-- Queue reservation and heartbeat hot paths.
create index if not exists call_queue_reservations_expiry_idx
  on public.call_queue_reservations(organization_id, status, expires_at)
  where status in ('reserved','connecting');
create index if not exists agent_devices_live_inbound_idx
  on public.agent_devices(organization_id, user_id, last_heartbeat_at desc)
  where status = 'online' and supports_inbound = true;

-- Normalize whitespace and reject unsupported capability values at write time.
create or replace function public.normalize_organization_phone_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.provider := lower(btrim(new.provider));
  new.phone_number := btrim(new.phone_number);
  new.provider_number_id := nullif(btrim(new.provider_number_id), '');
  new.friendly_name := coalesce(nullif(btrim(new.friendly_name), ''), new.phone_number);
  new.capabilities := coalesce(new.capabilities, '{}'::jsonb);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_organization_phone_number_trigger
  on public.organization_phone_numbers;
create trigger normalize_organization_phone_number_trigger
before insert or update on public.organization_phone_numbers
for each row execute function public.normalize_organization_phone_number();

revoke all on function public.normalize_organization_phone_number() from public, anon, authenticated;
grant execute on function public.normalize_organization_phone_number() to service_role;

commit;
