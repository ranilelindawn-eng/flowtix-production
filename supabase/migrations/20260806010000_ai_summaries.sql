begin;

create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  title text null,
  summary text not null,
  key_points text null,
  action_items text null,
  sentiment text null,
  provider text not null default 'Manual',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.summaries
  add column if not exists model text null,
  add column if not exists prompt_key text null,
  add column if not exists prompt_version integer null,
  add column if not exists provider_request_id text null,
  add column if not exists input_tokens integer null,
  add column if not exists output_tokens integer null,
  add column if not exists latency_ms integer null,
  add column if not exists generation_status text not null default 'manual',
  add column if not exists generation_key text null,
  add column if not exists generated_at timestamptz null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'summaries_sentiment_check'
      and conrelid = 'public.summaries'::regclass
  ) then
    alter table public.summaries
      add constraint summaries_sentiment_check
      check (sentiment is null or sentiment in ('positive', 'neutral', 'negative', 'mixed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'summaries_generation_status_check'
      and conrelid = 'public.summaries'::regclass
  ) then
    alter table public.summaries
      add constraint summaries_generation_status_check
      check (generation_status in ('manual', 'completed', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'summaries_prompt_version_check'
      and conrelid = 'public.summaries'::regclass
  ) then
    alter table public.summaries
      add constraint summaries_prompt_version_check
      check (prompt_version is null or prompt_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'summaries_token_counts_check'
      and conrelid = 'public.summaries'::regclass
  ) then
    alter table public.summaries
      add constraint summaries_token_counts_check
      check (
        (input_tokens is null or input_tokens >= 0)
        and (output_tokens is null or output_tokens >= 0)
        and (latency_ms is null or latency_ms >= 0)
      );
  end if;
end $$;

create index if not exists summaries_organization_created_idx
  on public.summaries (organization_id, created_at desc);

create index if not exists summaries_transcript_idx
  on public.summaries (organization_id, transcript_id, created_at desc);

create unique index if not exists summaries_generation_key_unique_idx
  on public.summaries (organization_id, generation_key)
  where generation_key is not null;

alter table public.summaries enable row level security;

drop policy if exists summaries_select_active_members on public.summaries;
create policy summaries_select_active_members
  on public.summaries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = summaries.organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

drop policy if exists summaries_insert_active_members on public.summaries;
create policy summaries_insert_active_members
  on public.summaries
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = summaries.organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
    and exists (
      select 1
      from public.transcripts transcript
      where transcript.id = summaries.transcript_id
        and transcript.organization_id = summaries.organization_id
    )
  );

drop policy if exists summaries_update_active_members on public.summaries;
create policy summaries_update_active_members
  on public.summaries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = summaries.organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = summaries.organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
    and exists (
      select 1
      from public.transcripts transcript
      where transcript.id = summaries.transcript_id
        and transcript.organization_id = summaries.organization_id
    )
  );

drop policy if exists summaries_delete_active_members on public.summaries;
create policy summaries_delete_active_members
  on public.summaries
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = summaries.organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

commit;
