-- Flowtix Automation 1.13
-- Optional AI-generated post-call follow-up.
--
-- AI remains OFF by default. Saved-template automation continues to work
-- without AI and without consuming AI usage.
--
-- Generated content is persisted by dispatch_job_id before communication jobs
-- are created, so a dispatcher retry reuses the exact same AI generation
-- instead of consuming a second AI request or changing customer-facing text.

begin;

alter table public.post_call_automation_configs
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_tone text not null default 'professional',
  add column if not exists ai_instructions text;

alter table public.post_call_automation_configs
  drop constraint if exists post_call_automation_configs_ai_tone_check;

alter table public.post_call_automation_configs
  add constraint post_call_automation_configs_ai_tone_check
  check (
    ai_tone in (
      'professional',
      'friendly',
      'concise',
      'persuasive'
    )
  );

alter table public.post_call_automation_configs
  drop constraint if exists post_call_automation_configs_ai_instructions_check;

alter table public.post_call_automation_configs
  add constraint post_call_automation_configs_ai_instructions_check
  check (
    ai_instructions is null
    or char_length(ai_instructions) <= 2000
  );

create table if not exists public.post_call_ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  dispatch_job_id uuid not null
    references public.background_jobs(id) on delete cascade,
  call_id uuid not null
    references public.calls(id) on delete cascade,
  contact_id uuid not null
    references public.contacts(id) on delete cascade,
  email_subject text,
  email_body text,
  sms_body text,
  provider text not null,
  model text,
  provider_request_id text,
  input_tokens integer
    check (input_tokens is null or input_tokens >= 0),
  output_tokens integer
    check (output_tokens is null or output_tokens >= 0),
  latency_ms integer
    check (latency_ms is null or latency_ms >= 0),
  prompt_key text not null,
  prompt_version integer not null
    check (prompt_version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, dispatch_job_id)
);

create index if not exists
  post_call_ai_generations_org_created_idx
on public.post_call_ai_generations (
  organization_id,
  created_at desc
);

create index if not exists
  post_call_ai_generations_call_idx
on public.post_call_ai_generations (
  organization_id,
  call_id
);

alter table public.post_call_ai_generations
  enable row level security;

drop policy if exists post_call_ai_generations_select
  on public.post_call_ai_generations;

create policy post_call_ai_generations_select
on public.post_call_ai_generations
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

revoke insert, update, delete
on public.post_call_ai_generations
from anon, authenticated;

comment on table public.post_call_ai_generations is
  'Durable organization-scoped AI personalization output for one post-call dispatch job. Generated content is reused across job retries.';

comment on column public.post_call_automation_configs.ai_enabled is
  'Opt-in Flowtix AI personalization. False preserves normal saved-template automation with no AI usage.';

notify pgrst, 'reload schema';

commit;
