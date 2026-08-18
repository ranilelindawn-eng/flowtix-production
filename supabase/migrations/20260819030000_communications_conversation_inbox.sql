-- Flowtix Communications Inbox
-- Adds tenant-scoped conversation threading, assignments, per-user read state,
-- inbound email metadata, and Gmail watch renewal scheduling without changing
-- existing outbound delivery, SMS consent, telephony, billing, or entitlement logic.

begin;

alter table public.communication_messages
  add column if not exists conversation_id uuid,
  add column if not exists provider_thread_id text,
  add column if not exists internet_message_id text,
  add column if not exists in_reply_to text,
  add column if not exists references_header text,
  add column if not exists received_at timestamptz;

create table if not exists public.communication_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  primary_channel text not null default 'email' check (primary_channel in ('email','sms')),
  last_channel text not null default 'email' check (last_channel in ('email','sms')),
  participant_address text,
  subject text,
  status text not null default 'open' check (status in ('open','closed')),
  assigned_membership_id uuid references public.organization_members(id) on delete set null,
  last_message_preview text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_direction text check (last_direction is null or last_direction in ('inbound','outbound')),
  last_email_thread_id text,
  last_email_internet_message_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communication_messages
  drop constraint if exists communication_messages_conversation_id_fkey;

alter table public.communication_messages
  add constraint communication_messages_conversation_id_fkey
  foreign key (conversation_id)
  references public.communication_conversations(id)
  on delete set null;

create table if not exists public.communication_conversation_reads (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_message_id uuid references public.communication_messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists communication_conversations_org_last_idx
  on public.communication_conversations (organization_id, last_message_at desc nulls last, created_at desc);

create index if not exists communication_conversations_contact_idx
  on public.communication_conversations (organization_id, contact_id, status)
  where contact_id is not null;

create index if not exists communication_conversations_assignment_idx
  on public.communication_conversations (organization_id, assigned_membership_id, status, last_message_at desc);

create index if not exists communication_conversations_participant_idx
  on public.communication_conversations (organization_id, lower(participant_address), primary_channel, status)
  where participant_address is not null;

create index if not exists communication_messages_conversation_created_idx
  on public.communication_messages (organization_id, conversation_id, created_at)
  where conversation_id is not null;

create index if not exists communication_messages_thread_idx
  on public.communication_messages (organization_id, provider, provider_thread_id, created_at)
  where provider_thread_id is not null;

create index if not exists communication_conversation_reads_user_idx
  on public.communication_conversation_reads (organization_id, user_id, last_read_at desc);

-- Reuse the existing current_organization_membership_id() ownership helper.

create or replace function public.touch_communication_conversation_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists communication_conversations_touch_updated_at
  on public.communication_conversations;
create trigger communication_conversations_touch_updated_at
before update on public.communication_conversations
for each row execute function public.touch_communication_conversation_updated_at();

create or replace function public.touch_communication_conversation_read_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists communication_conversation_reads_touch_updated_at
  on public.communication_conversation_reads;
create trigger communication_conversation_reads_touch_updated_at
before update on public.communication_conversation_reads
for each row execute function public.touch_communication_conversation_read_updated_at();

-- Resolve a contact and conversation inside the message organization only.
-- The organization is identified first; contact matching is never global.
create or replace function public.resolve_communication_message_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_participant text;
  v_contact_id uuid;
  v_company_id uuid;
  v_owner_membership_id uuid;
  v_conversation_id uuid;
  v_channel text;
begin
  if new.organization_id is null then
    return new;
  end if;

  v_channel := case when new.channel in ('email','sms') then new.channel else 'email' end;
  v_participant := nullif(btrim(case when new.direction = 'inbound' then coalesce(new.sender, '') else coalesce(new.recipient, '') end), '');
  v_contact_id := new.contact_id;
  v_company_id := new.company_id;

  if v_contact_id is null and v_participant is not null then
    if v_channel = 'email' then
      select contact.id, contact.company_id, contact.owner_membership_id
      into v_contact_id, v_company_id, v_owner_membership_id
      from public.contacts contact
      where contact.organization_id = new.organization_id
        and contact.merged_into_contact_id is null
        and contact.email is not null
        and lower(btrim(contact.email)) = lower(v_participant)
      order by contact.updated_at desc nulls last, contact.created_at desc
      limit 1;
    else
      select contact.id, contact.company_id, contact.owner_membership_id
      into v_contact_id, v_company_id, v_owner_membership_id
      from public.contacts contact
      where contact.organization_id = new.organization_id
        and contact.merged_into_contact_id is null
        and contact.phone is not null
        and regexp_replace(contact.phone, '[^0-9+]', '', 'g') = regexp_replace(v_participant, '[^0-9+]', '', 'g')
      order by contact.updated_at desc nulls last, contact.created_at desc
      limit 1;
    end if;
  elsif v_contact_id is not null then
    select contact.company_id, contact.owner_membership_id
    into v_company_id, v_owner_membership_id
    from public.contacts contact
    where contact.id = v_contact_id
      and contact.organization_id = new.organization_id
    limit 1;
  end if;

  if v_contact_id is not null then
    new.contact_id := v_contact_id;
  end if;
  if new.company_id is null and v_company_id is not null then
    new.company_id := v_company_id;
  end if;

  -- Serialize conversation resolution for the same tenant participant/contact so
  -- concurrent webhooks cannot accidentally create duplicate open threads.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.organization_id::text || ':' || coalesce(new.contact_id::text, v_channel || ':' || coalesce(v_participant, new.id::text)),
      0
    )
  );

  if new.conversation_id is not null then
    select conversation.id
    into v_conversation_id
    from public.communication_conversations conversation
    where conversation.id = new.conversation_id
      and conversation.organization_id = new.organization_id
    limit 1;

    if v_conversation_id is null then
      raise exception 'Communication conversation does not belong to this organization.'
        using errcode = '42501';
    end if;
  end if;

  if new.conversation_id is null then
    if new.contact_id is not null then
      select conversation.id
      into v_conversation_id
      from public.communication_conversations conversation
      where conversation.organization_id = new.organization_id
        and conversation.contact_id = new.contact_id
        and conversation.status = 'open'
      order by conversation.last_message_at desc nulls last, conversation.created_at desc
      limit 1;
    elsif v_participant is not null then
      select conversation.id
      into v_conversation_id
      from public.communication_conversations conversation
      where conversation.organization_id = new.organization_id
        and conversation.contact_id is null
        and conversation.status = 'open'
        and conversation.primary_channel = v_channel
        and lower(coalesce(conversation.participant_address, '')) = lower(v_participant)
      order by conversation.last_message_at desc nulls last, conversation.created_at desc
      limit 1;
    end if;

    if v_conversation_id is null then
      insert into public.communication_conversations (
        organization_id,
        contact_id,
        company_id,
        primary_channel,
        last_channel,
        participant_address,
        subject,
        assigned_membership_id,
        created_by
      ) values (
        new.organization_id,
        new.contact_id,
        new.company_id,
        v_channel,
        v_channel,
        v_participant,
        nullif(btrim(coalesce(new.subject, '')), ''),
        v_owner_membership_id,
        new.sent_by
      )
      returning id into v_conversation_id;
    end if;

    new.conversation_id := v_conversation_id;
  end if;

  if new.direction = 'inbound' and new.received_at is null then
    new.received_at := coalesce(new.sent_at, now());
  end if;

  return new;
end;
$function$;

revoke all on function public.resolve_communication_message_conversation()
from public, anon, authenticated;
grant execute on function public.resolve_communication_message_conversation()
to service_role;

drop trigger if exists resolve_communication_message_conversation_trigger
  on public.communication_messages;
create trigger resolve_communication_message_conversation_trigger
before insert or update of organization_id, conversation_id, contact_id, company_id, channel, direction, recipient, sender, provider_thread_id
on public.communication_messages
for each row execute function public.resolve_communication_message_conversation();

create or replace function public.sync_communication_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_occurred_at timestamptz;
  v_participant text;
begin
  if new.conversation_id is null then
    return new;
  end if;

  v_occurred_at := coalesce(new.received_at, new.sent_at, new.created_at, now());
  v_participant := nullif(btrim(case when new.direction = 'inbound' then coalesce(new.sender, '') else coalesce(new.recipient, '') end), '');

  update public.communication_conversations conversation
  set
    contact_id = coalesce(conversation.contact_id, new.contact_id),
    company_id = coalesce(conversation.company_id, new.company_id),
    participant_address = coalesce(conversation.participant_address, v_participant),
    subject = case
      when conversation.subject is null then nullif(btrim(coalesce(new.subject, '')), '')
      when conversation.last_message_at is null or v_occurred_at >= conversation.last_message_at
        then coalesce(nullif(btrim(coalesce(new.subject, '')), ''), conversation.subject)
      else conversation.subject
    end,
    status = case when new.direction = 'inbound' then 'open' else conversation.status end,
    last_channel = case
      when conversation.last_message_at is null or v_occurred_at >= conversation.last_message_at then new.channel
      else conversation.last_channel
    end,
    last_message_preview = case
      when conversation.last_message_at is null or v_occurred_at >= conversation.last_message_at then left(new.body, 400)
      else conversation.last_message_preview
    end,
    last_message_at = greatest(coalesce(conversation.last_message_at, '-infinity'::timestamptz), v_occurred_at),
    last_inbound_at = case
      when new.direction = 'inbound' then greatest(coalesce(conversation.last_inbound_at, '-infinity'::timestamptz), v_occurred_at)
      else conversation.last_inbound_at
    end,
    last_outbound_at = case
      when new.direction = 'outbound' then greatest(coalesce(conversation.last_outbound_at, '-infinity'::timestamptz), v_occurred_at)
      else conversation.last_outbound_at
    end,
    last_direction = case
      when conversation.last_message_at is null or v_occurred_at >= conversation.last_message_at then new.direction
      else conversation.last_direction
    end,
    last_email_thread_id = case
      when new.channel = 'email' and new.provider_thread_id is not null then new.provider_thread_id
      else conversation.last_email_thread_id
    end,
    last_email_internet_message_id = case
      when new.channel = 'email' and new.internet_message_id is not null then new.internet_message_id
      else conversation.last_email_internet_message_id
    end,
    updated_at = now()
  where conversation.id = new.conversation_id
    and conversation.organization_id = new.organization_id;

  return new;
end;
$function$;

revoke all on function public.sync_communication_conversation_from_message()
from public, anon, authenticated;
grant execute on function public.sync_communication_conversation_from_message()
to service_role;

drop trigger if exists sync_communication_conversation_from_message_trigger
  on public.communication_messages;
create trigger sync_communication_conversation_from_message_trigger
after insert or update of conversation_id, provider_thread_id, internet_message_id, status, sent_at, delivered_at, failed_at
on public.communication_messages
for each row execute function public.sync_communication_conversation_from_message();

-- Existing rows are threaded without changing their message content or delivery state.
update public.communication_messages
set conversation_id = conversation_id
where conversation_id is null;

-- Inbound Gmail replies are added to the CRM timeline. The existing inbound SMS
-- trigger remains untouched and continues to handle SMS replies independently.
create or replace function public.capture_inbound_email_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.channel = 'email'
     and new.direction = 'inbound'
     and new.status = 'received'
     and new.contact_id is not null then
    perform public.write_crm_timeline_event(
      new.organization_id,
      new.contact_id,
      new.company_id,
      null,
      'system',
      'received',
      'communication_messages',
      new.id,
      'communication_messages:' || new.id::text || ':email_received',
      coalesce(nullif(new.subject, ''), 'Email received'),
      new.body,
      coalesce(new.received_at, new.sent_at, new.created_at, pg_catalog.now()),
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

revoke all on function public.capture_inbound_email_timeline_event()
from public, anon, authenticated;
grant execute on function public.capture_inbound_email_timeline_event()
to service_role;

drop trigger if exists capture_inbound_email_timeline_event_trigger
  on public.communication_messages;
create trigger capture_inbound_email_timeline_event_trigger
after insert on public.communication_messages
for each row execute function public.capture_inbound_email_timeline_event();

-- Conversation assignment/status changes are done through guarded RPCs rather
-- than direct table updates by browser clients.
create or replace function public.assign_communication_conversation(
  p_conversation_id uuid,
  p_assigned_membership_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_organization_id uuid;
  v_role text;
begin
  select conversation.organization_id
  into v_organization_id
  from public.communication_conversations conversation
  where conversation.id = p_conversation_id;

  if v_organization_id is null then
    return false;
  end if;

  v_role := public.organization_role(v_organization_id);
  if v_role not in ('owner','admin','manager') then
    raise exception 'Conversation assignment permission required.' using errcode = '42501';
  end if;

  if p_assigned_membership_id is not null and not exists (
    select 1
    from public.organization_members member
    where member.id = p_assigned_membership_id
      and member.organization_id = v_organization_id
      and coalesce(member.status::text, 'active') = 'active'
  ) then
    raise exception 'Assigned member does not belong to this organization.' using errcode = '22023';
  end if;

  update public.communication_conversations
  set assigned_membership_id = p_assigned_membership_id,
      updated_at = now()
  where id = p_conversation_id
    and organization_id = v_organization_id;

  return found;
end;
$function$;

revoke all on function public.assign_communication_conversation(uuid,uuid)
from public, anon;
grant execute on function public.assign_communication_conversation(uuid,uuid)
to authenticated, service_role;

create or replace function public.set_communication_conversation_status(
  p_conversation_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_organization_id uuid;
  v_role text;
begin
  if p_status not in ('open','closed') then
    raise exception 'Invalid conversation status.' using errcode = '22023';
  end if;

  select conversation.organization_id
  into v_organization_id
  from public.communication_conversations conversation
  where conversation.id = p_conversation_id;

  if v_organization_id is null then
    return false;
  end if;

  v_role := public.organization_role(v_organization_id);
  if v_role not in ('owner','admin') then
    raise exception 'Conversation management permission required.' using errcode = '42501';
  end if;

  update public.communication_conversations
  set status = p_status,
      updated_at = now()
  where id = p_conversation_id
    and organization_id = v_organization_id;

  return found;
end;
$function$;

revoke all on function public.set_communication_conversation_status(uuid,text)
from public, anon;
grant execute on function public.set_communication_conversation_status(uuid,text)
to authenticated, service_role;

alter table public.communication_conversations enable row level security;
alter table public.communication_conversation_reads enable row level security;

-- Replace the original broad communication message read policy with
-- assignment-aware conversation reads and authenticated writes. Service-role
-- delivery/webhook workers continue to bypass RLS as they do elsewhere in Flowtix.
drop policy if exists communication_messages_tenant_access
  on public.communication_messages;
drop policy if exists communication_messages_select_conversation_access
  on public.communication_messages;
drop policy if exists communication_messages_insert_member
  on public.communication_messages;
drop policy if exists communication_messages_update_member
  on public.communication_messages;
drop policy if exists communication_messages_delete_member
  on public.communication_messages;

create policy communication_messages_select_conversation_access
on public.communication_messages
for select to authenticated
using (
  public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_messages.conversation_id
      and conversation.organization_id = communication_messages.organization_id
      and (
        public.organization_role(conversation.organization_id) in ('owner','admin','manager')
        or conversation.assigned_membership_id is null
        or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
      )
  )
);

create policy communication_messages_insert_member
on public.communication_messages
for insert to authenticated
with check (
  public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_messages.conversation_id
      and conversation.organization_id = communication_messages.organization_id
      and (
        public.organization_role(conversation.organization_id) in ('owner','admin','manager')
        or conversation.assigned_membership_id is null
        or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
      )
  )
);

create policy communication_messages_update_member
on public.communication_messages
for update to authenticated
using (
  public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_messages.conversation_id
      and conversation.organization_id = communication_messages.organization_id
      and (
        public.organization_role(conversation.organization_id) in ('owner','admin','manager')
        or conversation.assigned_membership_id is null
        or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
      )
  )
)
with check (
  public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_messages.conversation_id
      and conversation.organization_id = communication_messages.organization_id
      and (
        public.organization_role(conversation.organization_id) in ('owner','admin','manager')
        or conversation.assigned_membership_id is null
        or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
      )
  )
);

create policy communication_messages_delete_member
on public.communication_messages
for delete to authenticated
using (
  public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_messages.conversation_id
      and conversation.organization_id = communication_messages.organization_id
      and (
        public.organization_role(conversation.organization_id) in ('owner','admin','manager')
        or conversation.assigned_membership_id is null
        or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
      )
  )
);

drop policy if exists communication_conversations_select_access
  on public.communication_conversations;
create policy communication_conversations_select_access
on public.communication_conversations
for select to authenticated
using (
  public.is_organization_member(organization_id)
  and (
    public.organization_role(organization_id) in ('owner','admin','manager')
    or assigned_membership_id is null
    or assigned_membership_id = public.current_organization_membership_id(organization_id)
  )
);

drop policy if exists communication_conversation_reads_select_own
  on public.communication_conversation_reads;
drop policy if exists communication_conversation_reads_insert_own
  on public.communication_conversation_reads;
drop policy if exists communication_conversation_reads_update_own
  on public.communication_conversation_reads;
drop policy if exists communication_conversation_reads_delete_own
  on public.communication_conversation_reads;

create policy communication_conversation_reads_select_own
on public.communication_conversation_reads
for select to authenticated
using (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
);

create policy communication_conversation_reads_insert_own
on public.communication_conversation_reads
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_conversation_reads.conversation_id
      and conversation.organization_id = communication_conversation_reads.organization_id
  )
);

create policy communication_conversation_reads_update_own
on public.communication_conversation_reads
for update to authenticated
using (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
)
with check (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.communication_conversations conversation
    where conversation.id = communication_conversation_reads.conversation_id
      and conversation.organization_id = communication_conversation_reads.organization_id
  )
);

create policy communication_conversation_reads_delete_own
on public.communication_conversation_reads
for delete to authenticated
using (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
);

revoke insert, update, delete on public.communication_conversations
from anon, authenticated;
grant select on public.communication_conversations to authenticated;
grant all on public.communication_conversations to service_role;

grant select, insert, update, delete
on public.communication_conversation_reads
to authenticated;
grant all on public.communication_conversation_reads to service_role;

-- Calculate per-user unread counts inside Postgres so the inbox does not need to
-- download every inbound message just to render unread badges.
create or replace function public.get_communication_unread_counts(
  p_organization_id uuid
)
returns table (
  conversation_id uuid,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Organization membership required.' using errcode = '42501';
  end if;

  return query
  select
    conversation.id,
    count(message.id)::bigint
  from public.communication_conversations conversation
  left join public.communication_conversation_reads read_state
    on read_state.conversation_id = conversation.id
   and read_state.organization_id = conversation.organization_id
   and read_state.user_id = auth.uid()
  left join public.communication_messages message
    on message.conversation_id = conversation.id
   and message.organization_id = conversation.organization_id
   and message.direction = 'inbound'
   and coalesce(message.received_at, message.sent_at, message.created_at)
       > coalesce(read_state.last_read_at, '-infinity'::timestamptz)
  where conversation.organization_id = p_organization_id
    and (
      public.organization_role(conversation.organization_id) in ('owner','admin','manager')
      or conversation.assigned_membership_id is null
      or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
    )
  group by conversation.id;
end;
$function$;

revoke all on function public.get_communication_unread_counts(uuid)
from public, anon;
grant execute on function public.get_communication_unread_counts(uuid)
to authenticated;

-- Merge Gmail inbox state atomically so a watch-renewal job and an inbound
-- history-sync job cannot overwrite each other's config fields. Gmail history
-- IDs are monotonic decimal strings, so preserve the greatest synchronized ID.
create or replace function public.merge_gmail_communication_integration_config(
  p_organization_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_current jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_current_history text;
  v_incoming_history text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gmail-config:' || p_organization_id::text, 0)
  );

  select coalesce(integration.config, '{}'::jsonb)
  into v_current
  from public.organization_integrations integration
  where integration.organization_id = p_organization_id
    and integration.provider = 'gmail'
  for update;

  if not found then
    raise exception 'Gmail integration was not found.' using errcode = 'P0002';
  end if;

  if v_patch ? 'gmail_sync_history_id' then
    v_current_history := nullif(pg_catalog.btrim(v_current ->> 'gmail_sync_history_id'), '');
    v_incoming_history := nullif(pg_catalog.btrim(v_patch ->> 'gmail_sync_history_id'), '');

    if v_current_history ~ '^[0-9]+$'
       and v_incoming_history ~ '^[0-9]+$'
       and v_current_history::numeric > v_incoming_history::numeric then
      v_patch := jsonb_set(v_patch, '{gmail_sync_history_id}', to_jsonb(v_current_history), true);
    end if;
  end if;

  v_current := v_current || v_patch;

  update public.organization_integrations integration
  set config = v_current,
      updated_at = now()
  where integration.organization_id = p_organization_id
    and integration.provider = 'gmail';

  return v_current;
end;
$function$;

revoke all on function public.merge_gmail_communication_integration_config(uuid,jsonb)
from public, anon, authenticated;
grant execute on function public.merge_gmail_communication_integration_config(uuid,jsonb)
to service_role;

-- Resolve a Gmail push to a tenant only by the mailbox address stored on that
-- tenant's Gmail integration. Multiple matches are intentionally returned so
-- application code can reject ambiguous routing rather than guessing.
create or replace function public.resolve_gmail_communication_organizations(
  p_email text
)
returns table (organization_id uuid)
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  select integration.organization_id
  from public.organization_integrations integration
  where integration.provider = 'gmail'
    and integration.enabled = true
    and integration.status = 'connected'
    and lower(pg_catalog.btrim(coalesce(integration.config ->> 'connected_email', '')))
        = lower(pg_catalog.btrim(coalesce(p_email, '')))
  order by integration.organization_id
  limit 2;
$function$;

revoke all on function public.resolve_gmail_communication_organizations(text)
from public, anon, authenticated;
grant execute on function public.resolve_gmail_communication_organizations(text)
to service_role;

-- Search full message content only inside conversations already visible in the
-- current tenant inbox. This keeps browser payloads small while still allowing
-- users to find an older Email/SMS reply by its text.
create or replace function public.search_communication_conversation_messages(
  p_organization_id uuid,
  p_conversation_ids uuid[],
  p_query text
)
returns table (conversation_id uuid)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_query text := lower(pg_catalog.btrim(coalesce(p_query, '')));
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Organization membership required.' using errcode = '42501';
  end if;

  if v_query = '' or coalesce(pg_catalog.array_length(p_conversation_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  select distinct message.conversation_id
  from public.communication_messages message
  join public.communication_conversations conversation
    on conversation.id = message.conversation_id
   and conversation.organization_id = message.organization_id
  where message.organization_id = p_organization_id
    and message.conversation_id = any(p_conversation_ids)
    and (
      public.organization_role(conversation.organization_id) in ('owner','admin','manager')
      or conversation.assigned_membership_id is null
      or conversation.assigned_membership_id = public.current_organization_membership_id(conversation.organization_id)
    )
    and pg_catalog.strpos(
      lower(pg_catalog.concat_ws(
        ' ',
        coalesce(message.subject, ''),
        coalesce(message.body, ''),
        coalesce(message.sender, ''),
        coalesce(message.recipient, '')
      )),
      v_query
    ) > 0
  limit 150;
end;
$function$;

revoke all on function public.search_communication_conversation_messages(uuid,uuid[],text)
from public, anon;
grant execute on function public.search_communication_conversation_messages(uuid,uuid[],text)
to authenticated;

-- The Inbox client listens for organization-filtered message changes. Enable the
-- existing message table for Supabase Realtime only when that publication exists.
do $block$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'communication_messages'
  ) then
    alter publication supabase_realtime add table public.communication_messages;
  end if;
end;
$block$;

-- Renew Gmail watches using the existing durable job/worker infrastructure.
-- The job handler is added in the matching application files. This scheduler
-- is idempotent per organization/day and does nothing for non-Gmail tenants.
create or replace function public.schedule_gmail_inbox_watch_renewals()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_inserted integer := 0;
begin
  insert into public.background_jobs (
    organization_id,
    queue,
    job_type,
    payload,
    status,
    priority,
    scheduled_at,
    max_attempts,
    idempotency_key,
    created_by
  )
  select
    integration.organization_id,
    'communications',
    'communications.gmail_watch_renew',
    jsonb_build_object('organizationId', integration.organization_id),
    'queued',
    60,
    now(),
    5,
    'gmail-watch-renew:' || integration.organization_id::text || ':' || to_char(current_date, 'YYYYMMDD'),
    null
  from public.organization_integrations integration
  where integration.provider = 'gmail'
    and integration.enabled = true
    and integration.status = 'connected'
  on conflict (organization_id, idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

revoke all on function public.schedule_gmail_inbox_watch_renewals()
from public, anon, authenticated;
grant execute on function public.schedule_gmail_inbox_watch_renewals()
to service_role;

-- pg_cron is already part of the Flowtix worker foundation. Keep a single
-- named schedule so re-running migrations cannot create duplicates.
do $block$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in
      select job.jobid
      from cron.job job
      where job.jobname = 'flowtix-gmail-watch-renewal'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'flowtix-gmail-watch-renewal',
      '17 2 * * *',
      $cron$select public.schedule_gmail_inbox_watch_renewals();$cron$
    );
  end if;
end;
$block$;

commit;
