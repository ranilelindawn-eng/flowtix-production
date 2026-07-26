begin;

create table if not exists public.ai_call_analyses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid null, contact_id uuid null, transcript_text text not null, summary text not null, follow_up text not null,
  sentiment text not null check (sentiment in ('positive','neutral','negative','mixed')), sentiment_score numeric(5,4) not null default 0,
  call_score integer not null check (call_score between 0 and 100), objections jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb, keywords jsonb not null default '[]'::jsonb, coaching jsonb not null default '[]'::jsonb,
  next_best_action text not null, provider text not null, created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table if not exists public.ai_generated_emails (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid null, recipient_name text null, purpose text not null, tone text not null, context text null, subject text not null, body text not null,
  created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table if not exists public.ai_task_suggestions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid null, call_id uuid null, title text not null, description text not null, priority text not null check(priority in ('low','medium','high')),
  due_in_days integer not null default 1 check(due_in_days between 0 and 30), accepted_at timestamptz null,
  created_at timestamptz not null default now(), created_by uuid default auth.uid()
);

alter table public.ai_call_analyses enable row level security;
alter table public.ai_generated_emails enable row level security;
alter table public.ai_task_suggestions enable row level security;

do $$ declare t text; begin
  foreach t in array array['ai_call_analyses','ai_generated_emails','ai_task_suggestions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant_access', t);
    execute format('create policy %I on public.%I for all using (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.user_id = auth.uid())) with check (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.user_id = auth.uid()))', t || '_tenant_access', t, t, t);
  end loop;
end $$;

create index if not exists ai_call_analyses_org_created_idx on public.ai_call_analyses(organization_id, created_at desc);
create index if not exists ai_generated_emails_org_created_idx on public.ai_generated_emails(organization_id, created_at desc);
create index if not exists ai_task_suggestions_org_created_idx on public.ai_task_suggestions(organization_id, created_at desc);
commit;
