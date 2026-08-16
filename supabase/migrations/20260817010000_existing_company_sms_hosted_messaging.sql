begin;

-- Flowtix existing-company-number SMS provisioning.
-- The carrier/provisioning request is tracked separately from the active
-- organization phone-number inventory. Activation is a platform-only action.

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and org_id is not null
    and not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.organization_id = org_id
        and member.user_id = auth.uid()
        and coalesce(member.status::text, 'active') = 'active'
        and member.role::text = 'owner'
        and coalesce(organization.status, 'active') = 'active'
    );
$function$;

revoke all on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;

create table if not exists public.organization_sms_sender_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number text not null,
  number_type text not null check (number_type in ('10dlc','toll_free')),
  voice_provider_name text not null check (char_length(voice_provider_name) between 2 and 120),
  authorized_contact_name text not null check (char_length(authorized_contact_name) between 2 and 160),
  authorized_contact_email text not null check (char_length(authorized_contact_email) between 3 and 320),
  company_website text,
  use_case text not null check (char_length(use_case) between 10 and 2000),
  sample_message text not null check (char_length(sample_message) between 5 and 1600),
  opt_in_description text not null check (char_length(opt_in_description) between 10 and 2000),
  ownership_authorized boolean not null default false,
  provider_split_authorized boolean not null default false,
  loa_file_name text not null,
  loa_storage_path text not null,
  invoice_file_name text not null,
  invoice_storage_path text not null,
  status text not null default 'provider_submission_required'
    check (status in (
      'provider_submission_required',
      'provider_processing',
      'active',
      'action_required',
      'rejected',
      'cancelled',
      'replaced'
    )),
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  provider_number_id text,
  provider_status text,
  provider_note text,
  provider_submission_reference text,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  provider_submitted_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_sms_sender_requests_e164_check
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  constraint organization_sms_sender_requests_authorization_check
    check (ownership_authorized = true and provider_split_authorized = true)
);

create index if not exists organization_sms_sender_requests_org_status_idx
  on public.organization_sms_sender_requests (organization_id, status, created_at desc);

create unique index if not exists organization_sms_sender_requests_phone_live_idx
  on public.organization_sms_sender_requests (organization_id, phone_number)
  where status in (
    'provider_submission_required',
    'provider_processing',
    'action_required',
    'active'
  );

create unique index if not exists organization_sms_sender_requests_one_pending_idx
  on public.organization_sms_sender_requests (organization_id)
  where status in (
    'provider_submission_required',
    'provider_processing',
    'action_required'
  );

create unique index if not exists organization_sms_sender_requests_one_active_idx
  on public.organization_sms_sender_requests (organization_id)
  where status = 'active';

create or replace function public.touch_organization_sms_sender_request()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

drop trigger if exists organization_sms_sender_requests_touch_updated_at
  on public.organization_sms_sender_requests;
create trigger organization_sms_sender_requests_touch_updated_at
before update on public.organization_sms_sender_requests
for each row execute function public.touch_organization_sms_sender_request();

alter table public.organization_sms_sender_requests enable row level security;
revoke all on table public.organization_sms_sender_requests from public, anon, authenticated;
grant select on table public.organization_sms_sender_requests to authenticated;
grant all on table public.organization_sms_sender_requests to service_role;

drop policy if exists organization_sms_sender_requests_owner_select
  on public.organization_sms_sender_requests;
create policy organization_sms_sender_requests_owner_select
on public.organization_sms_sender_requests
for select to authenticated
using (public.is_org_owner(organization_id));

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'sms-provisioning-documents',
  'sms-provisioning-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Service-only normalized contact lookup for inbound SMS matching.
create or replace function public.find_contact_for_inbound_sms(
  p_organization_id uuid,
  p_phone_number text
)
returns table (id uuid, company_id uuid)
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  select contact.id, contact.company_id
  from public.contacts contact
  where contact.organization_id = p_organization_id
    and regexp_replace(coalesce(contact.phone,''), '[^0-9+]', '', 'g') =
        regexp_replace(coalesce(p_phone_number,''), '[^0-9+]', '', 'g')
  order by contact.updated_at desc nulls last, contact.created_at desc
  limit 1;
$function$;

revoke all on function public.find_contact_for_inbound_sms(uuid,text)
from public, anon, authenticated;
grant execute on function public.find_contact_for_inbound_sms(uuid,text)
to service_role;

-- Existing timeline logic records only sent/delivered outbound communications.
-- This dedicated trigger adds received SMS replies without changing that logic.
create or replace function public.capture_inbound_sms_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.channel = 'sms'
     and new.direction = 'inbound'
     and new.status = 'received' then
    perform public.write_crm_timeline_event(
      new.organization_id,
      new.contact_id,
      new.company_id,
      null,
      'system',
      'received',
      'communication_messages',
      new.id,
      'communication_messages:' || new.id::text || ':sms_received',
      'SMS received',
      new.body,
      coalesce(new.sent_at, new.created_at, pg_catalog.now()),
      null,
      null,
      'organization',
      to_jsonb(new),
      jsonb_build_object('direction','inbound','provider',new.provider)
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.capture_inbound_sms_timeline_event()
from public, anon, authenticated;
grant execute on function public.capture_inbound_sms_timeline_event() to service_role;

drop trigger if exists capture_inbound_sms_timeline_event_trigger
  on public.communication_messages;
create trigger capture_inbound_sms_timeline_event_trigger
after insert on public.communication_messages
for each row execute function public.capture_inbound_sms_timeline_event();

-- Platform staff records the manual carrier-submission lifecycle.
create or replace function public.platform_mark_sms_sender_request(
  p_request_id uuid,
  p_status text,
  p_reason text,
  p_provider_reference text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  request_row public.organization_sms_sender_requests%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  normalized_reference text := nullif(pg_catalog.btrim(coalesce(p_provider_reference, '')), '');
begin
  select platform_user.* into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner','platform_admin','developer')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_status not in ('provider_processing','action_required','rejected') then
    raise exception 'SMS_PROVISIONING_STATUS_INVALID' using errcode = '22023';
  end if;

  if normalized_reason is null or pg_catalog.char_length(normalized_reason) < 5 then
    raise exception 'SMS_PROVISIONING_REASON_REQUIRED' using errcode = '22023';
  end if;

  select request.* into request_row
  from public.organization_sms_sender_requests request
  where request.id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'SMS_PROVISIONING_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if request_row.status in ('active','cancelled','replaced') then
    raise exception 'SMS_PROVISIONING_REQUEST_FINALIZED' using errcode = '55000';
  end if;

  update public.organization_sms_sender_requests
  set
    status = p_status,
    provider_status = p_status,
    provider_note = normalized_reason,
    provider_submission_reference = coalesce(normalized_reference, provider_submission_reference),
    provider_submitted_at = case
      when p_status = 'provider_processing' then coalesce(provider_submitted_at, pg_catalog.now())
      else provider_submitted_at
    end
  where id = request_row.id;

  insert into public.platform_audit_logs (
    platform_user_id, actor_user_id, actor_role, action, resource_type,
    resource_id, organization_id, reason, previous_state, resulting_state, metadata
  ) values (
    actor.id, actor.user_id, actor.role,
    case
      when p_status = 'provider_processing' then 'sms_sender.provider_submitted'
      when p_status = 'action_required' then 'sms_sender.action_required'
      else 'sms_sender.rejected'
    end,
    'organization_sms_sender_request', request_row.id::text,
    request_row.organization_id, normalized_reason,
    jsonb_build_object('status',request_row.status,'providerReference',request_row.provider_submission_reference),
    jsonb_build_object('status',p_status,'providerReference',coalesce(normalized_reference,request_row.provider_submission_reference)),
    jsonb_build_object('phoneNumber',request_row.phone_number,'provider','signalwire')
  );

  return true;
end;
$function$;

revoke all on function public.platform_mark_sms_sender_request(uuid,text,text,text)
from public, anon, authenticated;
grant execute on function public.platform_mark_sms_sender_request(uuid,text,text,text)
to authenticated, service_role;

-- Atomic Flowtix activation after the provider webhook has been configured.
create or replace function public.platform_activate_sms_sender_request(
  p_request_id uuid,
  p_provider_number_id text,
  p_friendly_name text,
  p_capabilities jsonb,
  p_provider_note text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  request_row public.organization_sms_sender_requests%rowtype;
  previous_active public.organization_sms_sender_requests%rowtype;
  normalized_provider_id text := nullif(pg_catalog.btrim(coalesce(p_provider_number_id, '')), '');
  normalized_name text := nullif(pg_catalog.btrim(coalesce(p_friendly_name, '')), '');
  normalized_note text := nullif(pg_catalog.btrim(coalesce(p_provider_note, '')), '');
begin
  select platform_user.* into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner','platform_admin','developer')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_TELEPHONY_ACCESS_DENIED' using errcode = '42501';
  end if;

  if normalized_provider_id is null then
    raise exception 'SIGNALWIRE_NUMBER_ID_REQUIRED' using errcode = '22023';
  end if;

  select request.* into request_row
  from public.organization_sms_sender_requests request
  where request.id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'SMS_PROVISIONING_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if request_row.status not in ('provider_processing','action_required','provider_submission_required') then
    raise exception 'SMS_PROVISIONING_REQUEST_NOT_ACTIVATABLE' using errcode = '55000';
  end if;

  if coalesce((p_capabilities->>'sms')::boolean, false) is not true then
    raise exception 'SIGNALWIRE_NUMBER_NOT_SMS_CAPABLE' using errcode = '55000';
  end if;

  select request.* into previous_active
  from public.organization_sms_sender_requests request
  where request.organization_id = request_row.organization_id
    and request.status = 'active'
    and request.id <> request_row.id
  for update;

  if previous_active.id is not null then
    update public.organization_sms_sender_requests
    set
      status = 'replaced',
      provider_status = 'replaced',
      provider_note = 'Replaced by a newer active company SMS sender.'
    where id = previous_active.id;
  end if;

  insert into public.organization_phone_numbers (
    organization_id, provider, provider_number_id, phone_number, friendly_name,
    capabilities, is_default, inbound_route, recording_enabled
  ) values (
    request_row.organization_id,
    'signalwire',
    normalized_provider_id,
    request_row.phone_number,
    coalesce(normalized_name, 'Company SMS ' || request_row.phone_number),
    coalesce(p_capabilities,'{}'::jsonb) || jsonb_build_object(
      'sms', true,
      'hosted_messaging', true,
      'sms_sender', true
    ),
    false,
    null,
    false
  )
  on conflict (organization_id, phone_number) do update
  set
    provider = 'signalwire',
    provider_number_id = excluded.provider_number_id,
    friendly_name = excluded.friendly_name,
    capabilities = coalesce(public.organization_phone_numbers.capabilities,'{}'::jsonb)
      || excluded.capabilities
      || jsonb_build_object('sms',true,'hosted_messaging',true,'sms_sender',true),
    updated_at = pg_catalog.now();

  update public.organization_sms_sender_requests
  set
    status = 'active',
    provider_number_id = normalized_provider_id,
    provider_status = 'active',
    provider_note = coalesce(normalized_note, 'SignalWire number synchronized and inbound SMS webhook configured.'),
    activated_at = pg_catalog.now()
  where id = request_row.id;

  insert into public.platform_audit_logs (
    platform_user_id, actor_user_id, actor_role, action, resource_type,
    resource_id, organization_id, reason, previous_state, resulting_state, metadata
  ) values (
    actor.id, actor.user_id, actor.role,
    'sms_sender.activated',
    'organization_sms_sender_request', request_row.id::text,
    request_row.organization_id,
    coalesce(normalized_note, 'SignalWire SMS sender synchronized and activated.'),
    jsonb_build_object('status',request_row.status,'previousActiveRequestId',previous_active.id),
    jsonb_build_object('status','active','providerNumberId',normalized_provider_id),
    jsonb_build_object('phoneNumber',request_row.phone_number,'provider','signalwire','capabilities',coalesce(p_capabilities,'{}'::jsonb))
  );

  return true;
end;
$function$;

revoke all on function public.platform_activate_sms_sender_request(uuid,text,text,jsonb,text)
from public, anon, authenticated;
grant execute on function public.platform_activate_sms_sender_request(uuid,text,text,jsonb,text)
to authenticated, service_role;

commit;
