begin;

-- Team Chat message reactions are internal-only and remain separate from
-- customer Conversations. One row is retained per user/message; a NULL emoji
-- represents a removed reaction so Realtime can propagate removals as UPDATEs.
create table if not exists public.team_chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.team_chat_conversations(id) on delete cascade,
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_chat_reaction_emoji_length check (
    emoji is null or char_length(emoji) between 1 and 16
  ),
  unique (message_id, user_id)
);

create index if not exists team_chat_message_reactions_conversation_idx
  on public.team_chat_message_reactions (conversation_id, updated_at desc);

create index if not exists team_chat_message_reactions_message_idx
  on public.team_chat_message_reactions (message_id, updated_at desc);

create index if not exists team_chat_message_reactions_org_idx
  on public.team_chat_message_reactions (organization_id, updated_at desc);

create or replace function public.team_chat_validate_reaction_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_org uuid;
  v_conversation uuid;
begin
  select message.organization_id, message.conversation_id
  into v_org, v_conversation
  from public.team_chat_messages message
  where message.id = new.message_id;

  if v_org is null
     or new.organization_id is distinct from v_org
     or new.conversation_id is distinct from v_conversation then
    raise exception 'TEAM_CHAT_REACTION_MESSAGE_MISMATCH'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.team_chat_members member
    where member.conversation_id = v_conversation
      and member.organization_id = v_org
      and member.user_id = new.user_id
  ) then
    raise exception 'TEAM_CHAT_REACTION_USER_NOT_CONVERSATION_MEMBER'
      using errcode = '42501';
  end if;

  new.emoji := nullif(btrim(new.emoji), '');
  if new.emoji is not null and char_length(new.emoji) > 16 then
    raise exception 'TEAM_CHAT_REACTION_INVALID'
      using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.team_chat_validate_reaction_row()
from public, anon, authenticated;

drop trigger if exists team_chat_validate_reaction_row_trigger
on public.team_chat_message_reactions;

create trigger team_chat_validate_reaction_row_trigger
before insert or update of organization_id, conversation_id, message_id, user_id, emoji
on public.team_chat_message_reactions
for each row execute function public.team_chat_validate_reaction_row();

alter table public.team_chat_message_reactions enable row level security;

drop policy if exists team_chat_message_reactions_select_chat_member
on public.team_chat_message_reactions;

create policy team_chat_message_reactions_select_chat_member
on public.team_chat_message_reactions
for select to authenticated
using (
  not public.is_active_platform_identity()
  and public.is_team_chat_member(conversation_id)
);

-- Client writes stay behind a security-definer RPC, matching the existing
-- Team Chat write architecture.
revoke all on public.team_chat_message_reactions from anon, authenticated;
grant select on public.team_chat_message_reactions to authenticated;
grant all on public.team_chat_message_reactions to service_role;

create or replace function public.team_chat_set_reaction(
  p_message_id uuid,
  p_emoji text
)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_conversation uuid;
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_existing text;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select message.organization_id, message.conversation_id
  into v_org, v_conversation
  from public.team_chat_messages message
  where message.id = p_message_id;

  if v_org is null
     or not public.is_organization_member(v_org)
     or not public.is_team_chat_member(v_conversation) then
    raise exception 'TEAM_CHAT_MESSAGE_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  if v_emoji is null or char_length(v_emoji) > 16 then
    raise exception 'TEAM_CHAT_REACTION_INVALID' using errcode = '22023';
  end if;

  select reaction.emoji
  into v_existing
  from public.team_chat_message_reactions reaction
  where reaction.message_id = p_message_id
    and reaction.user_id = v_user;

  -- Clicking the same emoji toggles the user's reaction off. Choosing another
  -- emoji replaces it, keeping one reaction per user/message like Messenger.
  if found and v_existing is not distinct from v_emoji then
    v_emoji := null;
  end if;

  insert into public.team_chat_message_reactions (
    organization_id,
    conversation_id,
    message_id,
    user_id,
    emoji
  )
  values (
    v_org,
    v_conversation,
    p_message_id,
    v_user,
    v_emoji
  )
  on conflict (message_id, user_id)
  do update set
    emoji = excluded.emoji,
    updated_at = now();

  return coalesce(v_emoji, '');
end;
$function$;

revoke all on function public.team_chat_set_reaction(uuid, text)
from public, anon;
grant execute on function public.team_chat_set_reaction(uuid, text)
to authenticated;

-- Add only the new Team Chat reactions table to the existing Realtime
-- publication. Existing Realtime configuration and other modules are untouched.
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
      and publication_table.tablename = 'team_chat_message_reactions'
  ) then
    alter publication supabase_realtime
      add table public.team_chat_message_reactions;
  end if;
end;
$block$;

notify pgrst, 'reload schema';

commit;
