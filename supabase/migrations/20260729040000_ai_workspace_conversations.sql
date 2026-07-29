begin;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  agent_key text not null default 'general',
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 50000),
  provider text null,
  model text null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_saved_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  prompt text not null,
  category text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_owner_updated_idx
  on public.ai_conversations(created_by, updated_at desc)
  where archived_at is null;
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages(conversation_id, created_at asc);
create index if not exists ai_saved_prompts_owner_created_idx
  on public.ai_saved_prompts(created_by, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_saved_prompts enable row level security;

grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, update, delete on public.ai_messages to authenticated;
grant select, insert, update, delete on public.ai_saved_prompts to authenticated;
revoke all on public.ai_conversations from anon;
revoke all on public.ai_messages from anon;
revoke all on public.ai_saved_prompts from anon;

drop policy if exists ai_conversations_owner_access on public.ai_conversations;
create policy ai_conversations_owner_access
on public.ai_conversations
for all
to authenticated
using (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
)
with check (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
);

drop policy if exists ai_messages_owner_access on public.ai_messages;
create policy ai_messages_owner_access
on public.ai_messages
for all
to authenticated
using (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.ai_conversations c
    where c.id = ai_messages.conversation_id
      and c.created_by = auth.uid()
      and c.organization_id = ai_messages.organization_id
  )
)
with check (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.ai_conversations c
    where c.id = ai_messages.conversation_id
      and c.created_by = auth.uid()
      and c.organization_id = ai_messages.organization_id
  )
);

drop policy if exists ai_saved_prompts_owner_access on public.ai_saved_prompts;
create policy ai_saved_prompts_owner_access
on public.ai_saved_prompts
for all
to authenticated
using (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
)
with check (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
);

commit;
notify pgrst, 'reload schema';
