begin;

create table if not exists public.ai_coaching_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  call_id uuid null references public.calls(id) on delete set null,
  agent_user_id uuid null references auth.users(id) on delete set null,
  focus text not null default 'Balanced review across all coaching competencies',
  source_hash text not null,
  overall_score integer not null check (overall_score between 0 and 100),
  confidence numeric(6,5) not null check (confidence between 0 and 1),
  manager_summary text not null,
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  competencies jsonb not null default '[]'::jsonb,
  moments jsonb not null default '[]'::jsonb,
  action_plan jsonb not null default '[]'::jsonb,
  compliance_flags jsonb not null default '[]'::jsonb,
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
  constraint ai_coaching_focus_length check (char_length(focus) between 1 and 500),
  constraint ai_coaching_strengths_array check (jsonb_typeof(strengths) = 'array'),
  constraint ai_coaching_improvements_array check (jsonb_typeof(improvements) = 'array'),
  constraint ai_coaching_competencies_array check (jsonb_typeof(competencies) = 'array'),
  constraint ai_coaching_moments_array check (jsonb_typeof(moments) = 'array'),
  constraint ai_coaching_action_plan_array check (jsonb_typeof(action_plan) = 'array'),
  constraint ai_coaching_compliance_flags_array check (jsonb_typeof(compliance_flags) = 'array'),
  constraint ai_coaching_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (organization_id, generation_key)
);

create index if not exists ai_coaching_org_created_idx
  on public.ai_coaching_analyses(organization_id, created_at desc);
create index if not exists ai_coaching_transcript_idx
  on public.ai_coaching_analyses(organization_id, transcript_id, created_at desc);
create index if not exists ai_coaching_call_idx
  on public.ai_coaching_analyses(organization_id, call_id, created_at desc)
  where call_id is not null;
create index if not exists ai_coaching_agent_idx
  on public.ai_coaching_analyses(organization_id, agent_user_id, created_at desc)
  where agent_user_id is not null;

alter table public.ai_coaching_analyses enable row level security;

drop policy if exists ai_coaching_analyses_select on public.ai_coaching_analyses;
create policy ai_coaching_analyses_select
on public.ai_coaching_analyses for select
to authenticated
using (
  exists (
    select 1 from public.organization_members member
    where member.organization_id = ai_coaching_analyses.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
);

drop policy if exists ai_coaching_analyses_insert on public.ai_coaching_analyses;
create policy ai_coaching_analyses_insert
on public.ai_coaching_analyses for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.organization_members member
    where member.organization_id = ai_coaching_analyses.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
  and exists (
    select 1 from public.transcripts transcript
    where transcript.id = ai_coaching_analyses.transcript_id
      and transcript.organization_id = ai_coaching_analyses.organization_id
  )
  and (
    call_id is null
    or exists (
      select 1 from public.calls call_record
      where call_record.id = ai_coaching_analyses.call_id
        and call_record.organization_id = ai_coaching_analyses.organization_id
    )
  )
  and (
    agent_user_id is null
    or exists (
      select 1 from public.organization_members agent_member
      where agent_member.organization_id = ai_coaching_analyses.organization_id
        and agent_member.user_id = ai_coaching_analyses.agent_user_id
        and coalesce(agent_member.status, 'active') = 'active'
    )
  )
);

revoke all on public.ai_coaching_analyses from anon;
grant select, insert on public.ai_coaching_analyses to authenticated;
grant all on public.ai_coaching_analyses to service_role;

commit;
