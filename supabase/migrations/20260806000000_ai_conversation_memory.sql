begin;

alter table public.ai_conversations
  add column if not exists memory_version bigint not null default 0,
  add column if not exists memory_updated_at timestamptz null,
  add column if not exists last_message_sequence bigint not null default 0,
  add column if not exists context_message_limit integer not null default 40,
  add column if not exists context_character_limit integer not null default 24000,
  add column if not exists memory_metadata jsonb not null default '{}'::jsonb;

alter table public.ai_conversations
  drop constraint if exists ai_conversations_context_message_limit_check,
  add constraint ai_conversations_context_message_limit_check
    check (context_message_limit between 4 and 100),
  drop constraint if exists ai_conversations_context_character_limit_check,
  add constraint ai_conversations_context_character_limit_check
    check (context_character_limit between 2000 and 100000);

alter table public.ai_messages
  add column if not exists sequence_number bigint null,
  add column if not exists token_estimate integer not null default 0,
  add column if not exists prompt_key text null,
  add column if not exists prompt_version integer null,
  add column if not exists provider_request_id text null,
  add column if not exists input_tokens integer null,
  add column if not exists output_tokens integer null,
  add column if not exists latency_ms integer null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.ai_messages
  drop constraint if exists ai_messages_token_estimate_check,
  add constraint ai_messages_token_estimate_check check (token_estimate >= 0),
  drop constraint if exists ai_messages_prompt_version_check,
  add constraint ai_messages_prompt_version_check check (prompt_version is null or prompt_version > 0),
  drop constraint if exists ai_messages_latency_ms_check,
  add constraint ai_messages_latency_ms_check check (latency_ms is null or latency_ms >= 0);

create table if not exists public.ai_conversation_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_key text not null,
  memory_type text not null default 'context'
    check (memory_type in ('fact', 'preference', 'goal', 'constraint', 'context')),
  value text not null check (char_length(value) between 1 and 4000),
  importance integer not null default 50 check (importance between 0 and 100),
  source_message_id uuid null references public.ai_messages(id) on delete set null,
  is_active boolean not null default true,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, memory_key)
);

create unique index if not exists ai_messages_conversation_sequence_idx
  on public.ai_messages(conversation_id, sequence_number asc)
  where sequence_number is not null;

create index if not exists ai_conversation_memories_active_idx
  on public.ai_conversation_memories(conversation_id, importance desc, updated_at desc)
  where is_active = true;

create index if not exists ai_conversation_memories_organization_idx
  on public.ai_conversation_memories(organization_id, updated_at desc);

create or replace function public.assign_ai_message_memory_sequence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence bigint;
  v_owner uuid;
  v_organization uuid;
begin
  select created_by, organization_id
    into v_owner, v_organization
  from public.ai_conversations
  where id = new.conversation_id
  for update;

  if not found then
    raise exception 'AI conversation not found.' using errcode = 'P0002';
  end if;

  if v_owner <> new.created_by or v_organization <> new.organization_id then
    raise exception 'AI message tenant or owner mismatch.' using errcode = '42501';
  end if;

  update public.ai_conversations
  set last_message_sequence = last_message_sequence + 1,
      updated_at = now()
  where id = new.conversation_id
  returning last_message_sequence into v_sequence;

  new.sequence_number := coalesce(new.sequence_number, v_sequence);
  new.token_estimate := greatest(1, ceil(char_length(new.content)::numeric / 4)::integer);
  return new;
end;
$$;

revoke all on function public.assign_ai_message_memory_sequence() from public, anon, authenticated;

drop trigger if exists ai_messages_assign_memory_sequence on public.ai_messages;
create trigger ai_messages_assign_memory_sequence
before insert on public.ai_messages
for each row execute function public.assign_ai_message_memory_sequence();

with ranked as (
  select id,
         row_number() over (partition by conversation_id order by created_at asc, id asc) as sequence_number
  from public.ai_messages
  where sequence_number is null
)
update public.ai_messages m
set sequence_number = ranked.sequence_number,
    token_estimate = greatest(1, ceil(char_length(m.content)::numeric / 4)::integer)
from ranked
where m.id = ranked.id;

update public.ai_conversations c
set last_message_sequence = coalesce(source.maximum_sequence, 0)
from (
  select conversation_id, max(sequence_number) as maximum_sequence
  from public.ai_messages
  group by conversation_id
) source
where c.id = source.conversation_id;

create or replace function public.touch_ai_conversation_memory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.ai_conversations
    set memory_version = memory_version + 1,
        memory_updated_at = now(),
        updated_at = now()
    where id = old.conversation_id;
    return old;
  end if;

  update public.ai_conversations
  set memory_version = memory_version + 1,
      memory_updated_at = now(),
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_ai_conversation_memory() from public, anon, authenticated;

drop trigger if exists ai_conversation_memories_touch_conversation on public.ai_conversation_memories;
create trigger ai_conversation_memories_touch_conversation
after insert or update or delete on public.ai_conversation_memories
for each row execute function public.touch_ai_conversation_memory();

alter table public.ai_conversation_memories enable row level security;

grant select, insert, update, delete on public.ai_conversation_memories to authenticated;
revoke all on public.ai_conversation_memories from anon;

drop policy if exists ai_conversation_memories_owner_access on public.ai_conversation_memories;
create policy ai_conversation_memories_owner_access
on public.ai_conversation_memories
for all
to authenticated
using (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.ai_conversations c
    where c.id = ai_conversation_memories.conversation_id
      and c.organization_id = ai_conversation_memories.organization_id
      and c.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.ai_conversations c
    where c.id = ai_conversation_memories.conversation_id
      and c.organization_id = ai_conversation_memories.organization_id
      and c.created_by = auth.uid()
  )
  and (
    source_message_id is null
    or exists (
      select 1
      from public.ai_messages m
      where m.id = ai_conversation_memories.source_message_id
        and m.conversation_id = ai_conversation_memories.conversation_id
        and m.organization_id = ai_conversation_memories.organization_id
        and m.created_by = auth.uid()
    )
  )
);

commit;
notify pgrst, 'reload schema';
