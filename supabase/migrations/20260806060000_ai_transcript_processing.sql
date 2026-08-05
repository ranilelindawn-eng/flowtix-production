begin;

alter table public.transcripts
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_version integer,
  add column if not exists normalized_content text,
  add column if not exists redacted_content text,
  add column if not exists detected_language text,
  add column if not exists speaker_count integer not null default 0,
  add column if not exists word_count integer not null default 0,
  add column if not exists quality_score integer,
  add column if not exists processing_confidence numeric(6,5),
  add column if not exists processed_at timestamptz,
  add column if not exists processing_metadata jsonb not null default '{}'::jsonb;

alter table public.transcripts
  drop constraint if exists transcripts_processing_status_check,
  add constraint transcripts_processing_status_check
    check (processing_status in ('pending','processing','completed','failed')),
  drop constraint if exists transcripts_processing_version_check,
  add constraint transcripts_processing_version_check
    check (processing_version is null or processing_version > 0),
  drop constraint if exists transcripts_processing_metrics_check,
  add constraint transcripts_processing_metrics_check
    check (
      speaker_count >= 0
      and word_count >= 0
      and (quality_score is null or quality_score between 0 and 100)
      and (processing_confidence is null or processing_confidence between 0 and 1)
    );

create table if not exists public.ai_transcript_processing_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  source_hash text not null,
  generation_key text not null,
  normalized_content text,
  redacted_content text,
  language text not null default 'en',
  speaker_count integer not null default 0 check (speaker_count >= 0),
  word_count integer not null default 0 check (word_count >= 0),
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  confidence numeric(6,5) not null default 0 check (confidence between 0 and 1),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  provider text,
  model text,
  prompt_key text not null,
  prompt_version integer not null check (prompt_version > 0),
  provider_request_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ai_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  processing_run_id uuid not null references public.ai_transcript_processing_runs(id) on delete cascade,
  position integer not null check (position > 0),
  speaker_label text not null,
  speaker_role text not null default 'unknown'
    check (speaker_role in ('agent','customer','supervisor','unknown')),
  content text not null,
  start_ms integer check (start_ms is null or start_ms >= 0),
  end_ms integer check (end_ms is null or end_ms >= 0),
  confidence numeric(6,5) check (confidence is null or confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (processing_run_id, position),
  check (end_ms is null or start_ms is null or end_ms >= start_ms)
);

create unique index if not exists ai_transcript_processing_generation_uidx
  on public.ai_transcript_processing_runs (organization_id, generation_key);
create index if not exists ai_transcript_processing_transcript_idx
  on public.ai_transcript_processing_runs (organization_id, transcript_id, created_at desc);
create index if not exists ai_transcript_processing_status_idx
  on public.ai_transcript_processing_runs (organization_id, status, created_at desc);
create index if not exists ai_transcript_segments_transcript_idx
  on public.ai_transcript_segments (organization_id, transcript_id, position);
create index if not exists transcripts_processing_status_idx
  on public.transcripts (organization_id, processing_status, updated_at desc);

alter table public.ai_transcript_processing_runs enable row level security;
alter table public.ai_transcript_segments enable row level security;

drop policy if exists ai_transcript_processing_runs_select_member on public.ai_transcript_processing_runs;
create policy ai_transcript_processing_runs_select_member
on public.ai_transcript_processing_runs for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists ai_transcript_processing_runs_insert_member on public.ai_transcript_processing_runs;
create policy ai_transcript_processing_runs_insert_member
on public.ai_transcript_processing_runs for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
  and exists (
    select 1 from public.transcripts transcript
    where transcript.id = transcript_id
      and transcript.organization_id = organization_id
  )
);

drop policy if exists ai_transcript_processing_runs_update_member on public.ai_transcript_processing_runs;
create policy ai_transcript_processing_runs_update_member
on public.ai_transcript_processing_runs for update to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists ai_transcript_processing_runs_delete_member on public.ai_transcript_processing_runs;
create policy ai_transcript_processing_runs_delete_member
on public.ai_transcript_processing_runs for delete to authenticated
using (created_by = auth.uid() or public.can_manage_organization_assignments(organization_id));

drop policy if exists ai_transcript_segments_select_member on public.ai_transcript_segments;
create policy ai_transcript_segments_select_member
on public.ai_transcript_segments for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists ai_transcript_segments_insert_member on public.ai_transcript_segments;
create policy ai_transcript_segments_insert_member
on public.ai_transcript_segments for insert to authenticated
with check (
  public.is_organization_member(organization_id)
  and exists (
    select 1 from public.ai_transcript_processing_runs processing_run
    where processing_run.id = processing_run_id
      and processing_run.organization_id = organization_id
      and processing_run.transcript_id = transcript_id
  )
);

drop policy if exists ai_transcript_segments_delete_member on public.ai_transcript_segments;
create policy ai_transcript_segments_delete_member
on public.ai_transcript_segments for delete to authenticated
using (public.is_organization_member(organization_id));

revoke all on public.ai_transcript_processing_runs from anon;
revoke all on public.ai_transcript_segments from anon;
grant select, insert, update, delete on public.ai_transcript_processing_runs to authenticated;
grant select, insert, delete on public.ai_transcript_segments to authenticated;
grant all on public.ai_transcript_processing_runs to service_role;
grant all on public.ai_transcript_segments to service_role;

commit;
