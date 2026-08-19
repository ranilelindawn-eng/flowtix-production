begin;

create extension if not exists pgcrypto;

-- Internal organization messaging. This is intentionally separate from
-- customer-facing communication_messages / Conversations.
create table if not exists public.team_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('direct', 'group')),
  name text,
  direct_key text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint team_chat_conversation_shape check (
    (kind = 'direct' and direct_key is not null)
    or
    (kind = 'group' and direct_key is null and nullif(btrim(name), '') is not null)
  ),
  unique (organization_id, direct_key)
);

create table if not exists public.team_chat_members (
  conversation_id uuid not null references public.team_chat_conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.team_chat_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint team_chat_message_body check (
    char_length(btrim(body)) between 1 and 4000
  )
);

-- Presence is deliberately persisted with RLS rather than using a public
-- Realtime Presence channel. This keeps online state tenant-isolated without
-- changing global Realtime channel settings used by other Flowtix modules.
create table if not exists public.team_chat_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Typing state is short-lived and organization/conversation scoped.
create table if not exists public.team_chat_typing (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.team_chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_typing boolean not null default false,
  expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists team_chat_conversations_org_recent_idx
  on public.team_chat_conversations (
    organization_id,
    last_message_at desc nulls last,
    created_at desc
  );

create index if not exists team_chat_members_user_org_idx
  on public.team_chat_members (user_id, organization_id, conversation_id);

create index if not exists team_chat_messages_conversation_recent_idx
  on public.team_chat_messages (conversation_id, created_at desc);

create index if not exists team_chat_messages_org_recent_idx
  on public.team_chat_messages (organization_id, created_at desc);

create index if not exists team_chat_presence_org_seen_idx
  on public.team_chat_presence (organization_id, last_seen_at desc);

create index if not exists team_chat_typing_conversation_expiry_idx
  on public.team_chat_typing (conversation_id, expires_at desc);

create or replace function public.team_chat_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.team_chat_touch_updated_at()
from public, anon, authenticated;

drop trigger if exists team_chat_conversation_updated_at_trigger
on public.team_chat_conversations;

create trigger team_chat_conversation_updated_at_trigger
before update on public.team_chat_conversations
for each row execute function public.team_chat_touch_updated_at();

-- Canonical membership check used by RLS. It requires BOTH active workspace
-- membership and explicit membership in the internal chat.
create or replace function public.is_team_chat_member(
  target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.team_chat_members chat_member
      join public.team_chat_conversations conversation
        on conversation.id = chat_member.conversation_id
      where chat_member.conversation_id = target_conversation_id
        and chat_member.user_id = auth.uid()
        and chat_member.organization_id = conversation.organization_id
        and public.is_organization_member(conversation.organization_id)
    );
$function$;

revoke all on function public.is_team_chat_member(uuid)
from public, anon;
grant execute on function public.is_team_chat_member(uuid)
to authenticated, service_role;

-- Enforce organization consistency even for security-definer mutations.
create or replace function public.team_chat_validate_member_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_org uuid;
begin
  select conversation.organization_id
  into v_org
  from public.team_chat_conversations conversation
  where conversation.id = new.conversation_id;

  if v_org is null or new.organization_id is distinct from v_org then
    raise exception 'TEAM_CHAT_ORGANIZATION_MISMATCH'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = v_org
      and member.user_id = new.user_id
      and coalesce(member.status::text, 'active') = 'active'
      and coalesce(organization.status, 'active') = 'active'
  ) then
    raise exception 'TEAM_CHAT_USER_NOT_ACTIVE_ORGANIZATION_MEMBER'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.team_chat_validate_member_row()
from public, anon, authenticated;

drop trigger if exists team_chat_validate_member_row_trigger
on public.team_chat_members;
create trigger team_chat_validate_member_row_trigger
before insert or update of organization_id, conversation_id, user_id
on public.team_chat_members
for each row execute function public.team_chat_validate_member_row();

create or replace function public.team_chat_validate_message_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_org uuid;
begin
  select conversation.organization_id
  into v_org
  from public.team_chat_conversations conversation
  where conversation.id = new.conversation_id;

  if v_org is null or new.organization_id is distinct from v_org then
    raise exception 'TEAM_CHAT_ORGANIZATION_MISMATCH'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.team_chat_members member
    where member.conversation_id = new.conversation_id
      and member.organization_id = v_org
      and member.user_id = new.sender_user_id
  ) then
    raise exception 'TEAM_CHAT_SENDER_NOT_CONVERSATION_MEMBER'
      using errcode = '42501';
  end if;

  new.body := btrim(new.body);
  return new;
end;
$function$;

revoke all on function public.team_chat_validate_message_row()
from public, anon, authenticated;

drop trigger if exists team_chat_validate_message_row_trigger
on public.team_chat_messages;
create trigger team_chat_validate_message_row_trigger
before insert or update of organization_id, conversation_id, sender_user_id, body
on public.team_chat_messages
for each row execute function public.team_chat_validate_message_row();

create or replace function public.team_chat_validate_typing_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_org uuid;
begin
  select conversation.organization_id
  into v_org
  from public.team_chat_conversations conversation
  where conversation.id = new.conversation_id;

  if v_org is null or new.organization_id is distinct from v_org then
    raise exception 'TEAM_CHAT_ORGANIZATION_MISMATCH'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.team_chat_members member
    where member.conversation_id = new.conversation_id
      and member.organization_id = v_org
      and member.user_id = new.user_id
  ) then
    raise exception 'TEAM_CHAT_TYPING_USER_NOT_CONVERSATION_MEMBER'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.team_chat_validate_typing_row()
from public, anon, authenticated;

drop trigger if exists team_chat_validate_typing_row_trigger
on public.team_chat_typing;
create trigger team_chat_validate_typing_row_trigger
before insert or update of organization_id, conversation_id, user_id, is_typing, expires_at
on public.team_chat_typing
for each row execute function public.team_chat_validate_typing_row();

alter table public.team_chat_conversations enable row level security;
alter table public.team_chat_members enable row level security;
alter table public.team_chat_messages enable row level security;
alter table public.team_chat_presence enable row level security;
alter table public.team_chat_typing enable row level security;

drop policy if exists team_chat_conversations_select_member
on public.team_chat_conversations;
create policy team_chat_conversations_select_member
on public.team_chat_conversations
for select to authenticated
using (
  not public.is_active_platform_identity()
  and public.is_team_chat_member(id)
);

drop policy if exists team_chat_members_select_chat_member
on public.team_chat_members;
create policy team_chat_members_select_chat_member
on public.team_chat_members
for select to authenticated
using (
  not public.is_active_platform_identity()
  and public.is_team_chat_member(conversation_id)
);

drop policy if exists team_chat_messages_select_chat_member
on public.team_chat_messages;
create policy team_chat_messages_select_chat_member
on public.team_chat_messages
for select to authenticated
using (
  not public.is_active_platform_identity()
  and public.is_team_chat_member(conversation_id)
);

drop policy if exists team_chat_presence_select_organization_member
on public.team_chat_presence;
create policy team_chat_presence_select_organization_member
on public.team_chat_presence
for select to authenticated
using (
  not public.is_active_platform_identity()
  and public.is_organization_member(organization_id)
);

drop policy if exists team_chat_typing_select_chat_member
on public.team_chat_typing;
create policy team_chat_typing_select_chat_member
on public.team_chat_typing
for select to authenticated
using (
  not public.is_active_platform_identity()
  and public.is_team_chat_member(conversation_id)
);

-- Writes are intentionally performed through the validated RPCs below.
revoke all on public.team_chat_conversations from anon, authenticated;
revoke all on public.team_chat_members from anon, authenticated;
revoke all on public.team_chat_messages from anon, authenticated;
revoke all on public.team_chat_presence from anon, authenticated;
revoke all on public.team_chat_typing from anon, authenticated;

grant select on public.team_chat_conversations to authenticated;
grant select on public.team_chat_members to authenticated;
grant select on public.team_chat_messages to authenticated;
grant select on public.team_chat_presence to authenticated;
grant select on public.team_chat_typing to authenticated;

grant all on public.team_chat_conversations to service_role;
grant all on public.team_chat_members to service_role;
grant all on public.team_chat_messages to service_role;
grant all on public.team_chat_presence to service_role;
grant all on public.team_chat_typing to service_role;

-- One direct thread per pair per organization.
create or replace function public.team_chat_create_direct(
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_key text;
  v_conversation uuid;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = v_user then
    raise exception 'TEAM_CHAT_DIRECT_TARGET_INVALID' using errcode = '22023';
  end if;

  select membership.organization_id
  into v_org
  from public.get_current_organization_membership() membership
  limit 1;

  if v_org is null then
    raise exception 'ACTIVE_ORGANIZATION_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = v_org
      and member.user_id = target_user_id
      and coalesce(member.status::text, 'active') = 'active'
  ) then
    raise exception 'TEAM_CHAT_TARGET_NOT_ORGANIZATION_MEMBER'
      using errcode = '42501';
  end if;

  v_key := least(v_user::text, target_user_id::text)
    || ':' || greatest(v_user::text, target_user_id::text);

  insert into public.team_chat_conversations (
    organization_id,
    kind,
    name,
    direct_key,
    created_by
  )
  values (v_org, 'direct', null, v_key, v_user)
  on conflict (organization_id, direct_key)
  do update set direct_key = excluded.direct_key
  returning id into v_conversation;

  insert into public.team_chat_members (
    conversation_id,
    organization_id,
    user_id,
    added_by,
    last_read_at
  )
  values
    (v_conversation, v_org, v_user, v_user, now()),
    (v_conversation, v_org, target_user_id, v_user, now())
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation;
end;
$function$;

create or replace function public.team_chat_create_group(
  p_name text,
  p_member_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_requested integer;
  v_valid integer;
  v_conversation uuid;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'TEAM_CHAT_GROUP_NAME_INVALID' using errcode = '22023';
  end if;

  select membership.organization_id
  into v_org
  from public.get_current_organization_membership() membership
  limit 1;

  if v_org is null then
    raise exception 'ACTIVE_ORGANIZATION_REQUIRED' using errcode = '42501';
  end if;

  select count(distinct requested_user)
  into v_requested
  from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested_user
  where requested_user <> v_user;

  if v_requested < 1 or v_requested > 49 then
    raise exception 'TEAM_CHAT_GROUP_MEMBER_COUNT_INVALID' using errcode = '22023';
  end if;

  select count(distinct member.user_id)
  into v_valid
  from public.organization_members member
  where member.organization_id = v_org
    and coalesce(member.status::text, 'active') = 'active'
    and member.user_id <> v_user
    and member.user_id = any(coalesce(p_member_user_ids, '{}'::uuid[]));

  if v_valid <> v_requested then
    raise exception 'TEAM_CHAT_GROUP_MEMBER_NOT_IN_ORGANIZATION'
      using errcode = '42501';
  end if;

  insert into public.team_chat_conversations (
    organization_id,
    kind,
    name,
    direct_key,
    created_by
  )
  values (v_org, 'group', v_name, null, v_user)
  returning id into v_conversation;

  insert into public.team_chat_members (
    conversation_id,
    organization_id,
    user_id,
    added_by,
    last_read_at
  )
  select
    v_conversation,
    v_org,
    member_user_id,
    v_user,
    now()
  from (
    select v_user as member_user_id
    union
    select requested_user
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested_user
    where requested_user <> v_user
  ) members;

  return v_conversation;
end;
$function$;

create or replace function public.team_chat_update_group(
  p_conversation_id uuid,
  p_name text,
  p_member_user_ids uuid[] default '{}'::uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_creator uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_requested integer;
  v_valid integer;
  v_role text;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select conversation.organization_id, conversation.created_by
  into v_org, v_creator
  from public.team_chat_conversations conversation
  where conversation.id = p_conversation_id
    and conversation.kind = 'group';

  if v_org is null
     or not public.is_organization_member(v_org)
     or not public.is_team_chat_member(p_conversation_id) then
    raise exception 'TEAM_CHAT_GROUP_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  v_role := public.organization_role(v_org);

  if v_creator <> v_user and coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'TEAM_CHAT_GROUP_MANAGE_DENIED' using errcode = '42501';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'TEAM_CHAT_GROUP_NAME_INVALID' using errcode = '22023';
  end if;

  select count(distinct requested_user)
  into v_requested
  from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested_user
  where requested_user <> v_user;

  if v_requested < 1 or v_requested > 49 then
    raise exception 'TEAM_CHAT_GROUP_MEMBER_COUNT_INVALID' using errcode = '22023';
  end if;

  select count(distinct member.user_id)
  into v_valid
  from public.organization_members member
  where member.organization_id = v_org
    and coalesce(member.status::text, 'active') = 'active'
    and member.user_id <> v_user
    and member.user_id = any(coalesce(p_member_user_ids, '{}'::uuid[]));

  if v_valid <> v_requested then
    raise exception 'TEAM_CHAT_GROUP_MEMBER_NOT_IN_ORGANIZATION'
      using errcode = '42501';
  end if;

  update public.team_chat_conversations
  set name = v_name
  where id = p_conversation_id;

  insert into public.team_chat_members (
    conversation_id,
    organization_id,
    user_id,
    added_by,
    last_read_at
  )
  select
    p_conversation_id,
    v_org,
    member_user_id,
    v_user,
    now()
  from (
    select v_user as member_user_id
    union
    select v_creator as member_user_id
    union
    select requested_user
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested_user
  ) wanted
  where member_user_id is not null
  on conflict (conversation_id, user_id) do nothing;

  delete from public.team_chat_members member
  where member.conversation_id = p_conversation_id
    and member.user_id <> v_user
    and member.user_id <> v_creator
    and not (
      member.user_id = any(coalesce(p_member_user_ids, '{}'::uuid[]))
    );

  return true;
end;
$function$;

create or replace function public.team_chat_send_message(
  p_conversation_id uuid,
  p_body text
)
returns table (
  id uuid,
  organization_id uuid,
  conversation_id uuid,
  sender_user_id uuid,
  body text,
  created_at timestamptz,
  read_by_count bigint
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.team_chat_messages%rowtype;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'TEAM_CHAT_MESSAGE_INVALID' using errcode = '22023';
  end if;

  select conversation.organization_id
  into v_org
  from public.team_chat_conversations conversation
  where conversation.id = p_conversation_id;

  if v_org is null
     or not public.is_organization_member(v_org)
     or not public.is_team_chat_member(p_conversation_id) then
    raise exception 'TEAM_CHAT_CONVERSATION_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  insert into public.team_chat_messages (
    organization_id,
    conversation_id,
    sender_user_id,
    body
  )
  values (v_org, p_conversation_id, v_user, v_body)
  returning * into v_message;

  update public.team_chat_conversations
  set last_message_at = v_message.created_at
  where public.team_chat_conversations.id = p_conversation_id;

  update public.team_chat_members
  set last_read_at = greatest(last_read_at, v_message.created_at)
  where public.team_chat_members.conversation_id = p_conversation_id
    and public.team_chat_members.user_id = v_user;

  return query
  select
    v_message.id,
    v_message.organization_id,
    v_message.conversation_id,
    v_message.sender_user_id,
    v_message.body,
    v_message.created_at,
    0::bigint;
end;
$function$;

create or replace function public.team_chat_mark_read(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if auth.uid() is null or not public.is_team_chat_member(p_conversation_id) then
    raise exception 'TEAM_CHAT_CONVERSATION_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  update public.team_chat_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  return found;
end;
$function$;

create or replace function public.team_chat_touch_presence()
returns timestamptz
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select membership.organization_id
  into v_org
  from public.get_current_organization_membership() membership
  limit 1;

  if v_org is null then
    raise exception 'ACTIVE_ORGANIZATION_REQUIRED' using errcode = '42501';
  end if;

  insert into public.team_chat_presence (organization_id, user_id, last_seen_at)
  values (v_org, v_user, v_now)
  on conflict (organization_id, user_id)
  do update set last_seen_at = excluded.last_seen_at;

  return v_now;
end;
$function$;

create or replace function public.team_chat_set_typing(
  p_conversation_id uuid,
  p_is_typing boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_expiry timestamptz;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select conversation.organization_id
  into v_org
  from public.team_chat_conversations conversation
  where conversation.id = p_conversation_id;

  if v_org is null
     or not public.is_organization_member(v_org)
     or not public.is_team_chat_member(p_conversation_id) then
    raise exception 'TEAM_CHAT_CONVERSATION_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  v_expiry := case
    when coalesce(p_is_typing, false) then now() + interval '6 seconds'
    else now()
  end;

  insert into public.team_chat_typing (
    organization_id,
    conversation_id,
    user_id,
    is_typing,
    expires_at,
    updated_at
  )
  values (
    v_org,
    p_conversation_id,
    v_user,
    coalesce(p_is_typing, false),
    v_expiry,
    now()
  )
  on conflict (conversation_id, user_id)
  do update set
    is_typing = excluded.is_typing,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  return true;
end;
$function$;

create or replace function public.team_chat_list_conversations()
returns table (
  conversation_id uuid,
  organization_id uuid,
  kind text,
  name text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender_id uuid,
  unread_count bigint,
  member_count bigint,
  member_user_ids uuid[]
)
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    return;
  end if;

  select membership.organization_id
  into v_org
  from public.get_current_organization_membership() membership
  limit 1;

  if v_org is null then
    return;
  end if;

  return query
  select
    conversation.id,
    conversation.organization_id,
    conversation.kind,
    conversation.name,
    conversation.created_by,
    conversation.created_at,
    conversation.updated_at,
    conversation.last_message_at,
    latest.body,
    latest.sender_user_id,
    coalesce(unread.total, 0)::bigint,
    coalesce(member_list.total, 0)::bigint,
    coalesce(member_list.user_ids, '{}'::uuid[])
  from public.team_chat_conversations conversation
  join public.team_chat_members viewer
    on viewer.conversation_id = conversation.id
   and viewer.organization_id = conversation.organization_id
   and viewer.user_id = v_user
  left join lateral (
    select message.body, message.sender_user_id
    from public.team_chat_messages message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as total
    from public.team_chat_messages message
    where message.conversation_id = conversation.id
      and message.sender_user_id <> v_user
      and message.created_at > viewer.last_read_at
  ) unread on true
  left join lateral (
    select
      count(*)::bigint as total,
      array_agg(member.user_id order by member.joined_at, member.user_id) as user_ids
    from public.team_chat_members member
    where member.conversation_id = conversation.id
  ) member_list on true
  where conversation.organization_id = v_org
  order by
    coalesce(conversation.last_message_at, conversation.created_at) desc,
    conversation.id;
end;
$function$;

create or replace function public.team_chat_get_messages(
  p_conversation_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  organization_id uuid,
  conversation_id uuid,
  sender_user_id uuid,
  body text,
  created_at timestamptz,
  read_by_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_org uuid;
begin
  if auth.uid() is null or not public.is_team_chat_member(p_conversation_id) then
    return;
  end if;

  select conversation.organization_id
  into v_org
  from public.team_chat_conversations conversation
  where conversation.id = p_conversation_id;

  if v_org is null or not public.is_organization_member(v_org) then
    return;
  end if;

  return query
  with recent as (
    select message.*
    from public.team_chat_messages message
    where message.conversation_id = p_conversation_id
      and message.organization_id = v_org
    order by message.created_at desc, message.id desc
    limit v_limit
  )
  select
    recent.id,
    recent.organization_id,
    recent.conversation_id,
    recent.sender_user_id,
    recent.body,
    recent.created_at,
    (
      select count(*)::bigint
      from public.team_chat_members reader
      where reader.conversation_id = recent.conversation_id
        and reader.user_id <> recent.sender_user_id
        and reader.last_read_at >= recent.created_at
    ) as read_by_count
  from recent
  order by recent.created_at asc, recent.id asc;
end;
$function$;

revoke all on function public.team_chat_create_direct(uuid)
from public, anon;
revoke all on function public.team_chat_create_group(text, uuid[])
from public, anon;
revoke all on function public.team_chat_update_group(uuid, text, uuid[])
from public, anon;
revoke all on function public.team_chat_send_message(uuid, text)
from public, anon;
revoke all on function public.team_chat_mark_read(uuid)
from public, anon;
revoke all on function public.team_chat_touch_presence()
from public, anon;
revoke all on function public.team_chat_set_typing(uuid, boolean)
from public, anon;
revoke all on function public.team_chat_list_conversations()
from public, anon;
revoke all on function public.team_chat_get_messages(uuid, integer)
from public, anon;

grant execute on function public.team_chat_create_direct(uuid)
to authenticated;
grant execute on function public.team_chat_create_group(text, uuid[])
to authenticated;
grant execute on function public.team_chat_update_group(uuid, text, uuid[])
to authenticated;
grant execute on function public.team_chat_send_message(uuid, text)
to authenticated;
grant execute on function public.team_chat_mark_read(uuid)
to authenticated;
grant execute on function public.team_chat_touch_presence()
to authenticated;
grant execute on function public.team_chat_set_typing(uuid, boolean)
to authenticated;
grant execute on function public.team_chat_list_conversations()
to authenticated;
grant execute on function public.team_chat_get_messages(uuid, integer)
to authenticated;

-- Add only the new internal-chat tables to the existing Realtime publication.
-- No global Realtime configuration is changed, so existing Flowtix modules keep
-- their current behavior.
do $block$
declare
  v_table text;
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
  ) then
    foreach v_table in array array[
      'team_chat_conversations',
      'team_chat_members',
      'team_chat_messages',
      'team_chat_presence',
      'team_chat_typing'
    ]
    loop
      if not exists (
        select 1
        from pg_catalog.pg_publication_tables publication_table
        where publication_table.pubname = 'supabase_realtime'
          and publication_table.schemaname = 'public'
          and publication_table.tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end;
$block$;

notify pgrst, 'reload schema';

commit;
