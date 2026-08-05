begin;

create table if not exists public.ai_sentiment_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transcript_id uuid null references public.transcripts(id) on delete cascade,
  call_id uuid null references public.calls(id) on delete set null,
  contact_id uuid null references public.contacts(id) on delete set null,
  source_type text not null check (source_type in ('text', 'transcript')),
  source_hash text not null,
  label text not null check (label in ('positive', 'neutral', 'negative', 'mixed')),
  score numeric(6,5) not null check (score between -1 and 1),
  confidence numeric(6,5) not null check (confidence between 0 and 1),
  intensity numeric(6,5) not null check (intensity between 0 and 1),
  emotions jsonb not null default '[]'::jsonb,
  drivers jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  segments jsonb not null default '[]'::jsonb,
  rationale text not null,
  provider text not null,
  model text null,
  prompt_key text not null,
  prompt_version integer not null check (prompt_version > 0),
  provider_request_id text null,
  input_tokens integer null check (input_tokens is null or input_tokens >= 0),
  output_tokens integer null check (output_tokens is null or output_tokens >= 0),
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  generation_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint ai_sentiment_source_check check (
    (source_type = 'transcript' and transcript_id is not null)
    or (source_type = 'text' and transcript_id is null)
  ),
  constraint ai_sentiment_emotions_array check (jsonb_typeof(emotions) = 'array'),
  constraint ai_sentiment_drivers_array check (jsonb_typeof(drivers) = 'array'),
  constraint ai_sentiment_risks_array check (jsonb_typeof(risks) = 'array'),
  constraint ai_sentiment_segments_array check (jsonb_typeof(segments) = 'array'),
  constraint ai_sentiment_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (organization_id, generation_key)
);

create index if not exists ai_sentiment_org_created_idx
  on public.ai_sentiment_analyses(organization_id, created_at desc);
create index if not exists ai_sentiment_transcript_idx
  on public.ai_sentiment_analyses(organization_id, transcript_id, created_at desc)
  where transcript_id is not null;
create index if not exists ai_sentiment_call_idx
  on public.ai_sentiment_analyses(organization_id, call_id, created_at desc)
  where call_id is not null;
create index if not exists ai_sentiment_label_idx
  on public.ai_sentiment_analyses(organization_id, label, created_at desc);

alter table public.ai_sentiment_analyses enable row level security;

drop policy if exists ai_sentiment_analyses_select on public.ai_sentiment_analyses;
create policy ai_sentiment_analyses_select
on public.ai_sentiment_analyses for select
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = ai_sentiment_analyses.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

drop policy if exists ai_sentiment_analyses_insert on public.ai_sentiment_analyses;
create policy ai_sentiment_analyses_insert
on public.ai_sentiment_analyses for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.organization_members member
    where member.organization_id = ai_sentiment_analyses.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
  and (
    transcript_id is null
    or exists (
      select 1 from public.transcripts transcript
      where transcript.id = ai_sentiment_analyses.transcript_id
        and transcript.organization_id = ai_sentiment_analyses.organization_id
    )
  )
  and (
    call_id is null
    or exists (
      select 1 from public.calls call_record
      where call_record.id = ai_sentiment_analyses.call_id
        and call_record.organization_id = ai_sentiment_analyses.organization_id
    )
  )
  and (
    contact_id is null
    or exists (
      select 1 from public.contacts contact
      where contact.id = ai_sentiment_analyses.contact_id
        and contact.organization_id = ai_sentiment_analyses.organization_id
    )
  )
);

revoke all on public.ai_sentiment_analyses from anon;
grant select, insert on public.ai_sentiment_analyses to authenticated;
grant all on public.ai_sentiment_analyses to service_role;

commit;
