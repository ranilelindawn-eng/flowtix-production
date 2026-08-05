begin;

alter table public.ai_generated_emails
  add column if not exists call_id uuid references public.calls(id) on delete set null,
  add column if not exists transcript_id uuid references public.transcripts(id) on delete set null,
  add column if not exists recipient_email text,
  add column if not exists call_to_action text,
  add column if not exists personalization_facts jsonb,
  add column if not exists compliance_warnings jsonb,
  add column if not exists status text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by uuid references auth.users(id) on delete set null,
  add column if not exists source_hash text,
  add column if not exists generation_key text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists prompt_key text,
  add column if not exists prompt_version integer,
  add column if not exists provider_request_id text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists latency_ms integer,
  add column if not exists metadata jsonb;

update public.ai_generated_emails
set
  personalization_facts = coalesce(personalization_facts, '[]'::jsonb),
  compliance_warnings = coalesce(compliance_warnings, '[]'::jsonb),
  status = coalesce(status, 'generated'),
  source_hash = coalesce(source_hash, encode(digest(id::text, 'sha256'), 'hex')),
  generation_key = coalesce(generation_key, encode(digest(organization_id::text || ':' || id::text, 'sha256'), 'hex')),
  provider = coalesce(provider, 'legacy'),
  prompt_key = coalesce(prompt_key, 'email.generate'),
  prompt_version = coalesce(prompt_version, 1),
  metadata = coalesce(metadata, '{}'::jsonb);

alter table public.ai_generated_emails
  alter column personalization_facts set default '[]'::jsonb,
  alter column personalization_facts set not null,
  alter column compliance_warnings set default '[]'::jsonb,
  alter column compliance_warnings set not null,
  alter column status set default 'generated',
  alter column status set not null,
  alter column source_hash set not null,
  alter column generation_key set not null,
  alter column provider set not null,
  alter column prompt_key set not null,
  alter column prompt_version set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.ai_generated_emails
  drop constraint if exists ai_generated_emails_tone_check,
  add constraint ai_generated_emails_tone_check
    check (tone in ('professional','friendly','concise','persuasive')),
  drop constraint if exists ai_generated_emails_status_check,
  add constraint ai_generated_emails_status_check
    check (status in ('generated','approved','dismissed')),
  drop constraint if exists ai_generated_emails_prompt_version_check,
  add constraint ai_generated_emails_prompt_version_check
    check (prompt_version > 0),
  drop constraint if exists ai_generated_emails_usage_metadata_check,
  add constraint ai_generated_emails_usage_metadata_check
    check (
      (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (latency_ms is null or latency_ms >= 0)
    ),
  drop constraint if exists ai_generated_emails_personalization_array_check,
  add constraint ai_generated_emails_personalization_array_check
    check (jsonb_typeof(personalization_facts) = 'array'),
  drop constraint if exists ai_generated_emails_warnings_array_check,
  add constraint ai_generated_emails_warnings_array_check
    check (jsonb_typeof(compliance_warnings) = 'array'),
  drop constraint if exists ai_generated_emails_lifecycle_check,
  add constraint ai_generated_emails_lifecycle_check
    check (
      (status = 'generated' and approved_at is null and dismissed_at is null)
      or (status = 'approved' and approved_at is not null and approved_by is not null and dismissed_at is null)
      or (status = 'dismissed' and dismissed_at is not null and dismissed_by is not null and approved_at is null)
    );

create unique index if not exists ai_generated_emails_generation_uidx
  on public.ai_generated_emails (organization_id, generation_key);
create index if not exists ai_generated_emails_status_created_idx
  on public.ai_generated_emails (organization_id, status, created_at desc);
create index if not exists ai_generated_emails_contact_created_idx
  on public.ai_generated_emails (organization_id, contact_id, created_at desc)
  where contact_id is not null;
create index if not exists ai_generated_emails_call_created_idx
  on public.ai_generated_emails (organization_id, call_id, created_at desc)
  where call_id is not null;
create index if not exists ai_generated_emails_transcript_created_idx
  on public.ai_generated_emails (organization_id, transcript_id, created_at desc)
  where transcript_id is not null;

alter table public.ai_generated_emails enable row level security;

drop policy if exists ai_generated_emails_tenant_access on public.ai_generated_emails;
drop policy if exists ai_generated_emails_select_member on public.ai_generated_emails;
create policy ai_generated_emails_select_member on public.ai_generated_emails
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists ai_generated_emails_insert_member on public.ai_generated_emails;
create policy ai_generated_emails_insert_member on public.ai_generated_emails
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_organization_member(organization_id)
  and (contact_id is null or exists (
    select 1 from public.contacts contact
    where contact.id = contact_id and contact.organization_id = organization_id
  ))
  and (call_id is null or exists (
    select 1 from public.calls call_record
    where call_record.id = call_id and call_record.organization_id = organization_id
  ))
  and (transcript_id is null or exists (
    select 1 from public.transcripts transcript
    where transcript.id = transcript_id and transcript.organization_id = organization_id
  ))
);

drop policy if exists ai_generated_emails_update_member on public.ai_generated_emails;
create policy ai_generated_emails_update_member on public.ai_generated_emails
for update to authenticated
using (public.is_organization_member(organization_id))
with check (
  public.is_organization_member(organization_id)
  and (contact_id is null or exists (
    select 1 from public.contacts contact
    where contact.id = contact_id and contact.organization_id = organization_id
  ))
  and (call_id is null or exists (
    select 1 from public.calls call_record
    where call_record.id = call_id and call_record.organization_id = organization_id
  ))
  and (transcript_id is null or exists (
    select 1 from public.transcripts transcript
    where transcript.id = transcript_id and transcript.organization_id = organization_id
  ))
);

drop policy if exists ai_generated_emails_delete_member on public.ai_generated_emails;
create policy ai_generated_emails_delete_member on public.ai_generated_emails
for delete to authenticated
using (created_by = auth.uid() or public.can_manage_organization_assignments(organization_id));

revoke all on public.ai_generated_emails from anon;
grant select, insert, update, delete on public.ai_generated_emails to authenticated;

commit;
