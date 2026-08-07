-- Flowtix Step 2 — database reproducibility repair for public.insights
--
-- contact_notes and the pre-extension contact_tasks schema belong in
-- supabase/schema.sql because historical migrations reference those tables.
--
-- insights depends on public.summaries, which is introduced by the later AI
-- migration chain. This forward-safe migration creates insights only when it
-- is genuinely missing. Existing production databases are left unchanged.

begin;

do $repair$
declare
  insights_already_exists boolean := to_regclass('public.insights') is not null;
begin
  if insights_already_exists then
    return;
  end if;

  if to_regclass('public.transcripts') is null then
    raise exception 'Cannot create public.insights: public.transcripts is missing.';
  end if;

  if to_regclass('public.summaries') is null then
    raise exception 'Cannot create public.insights: public.summaries is missing.';
  end if;

  create table public.insights (
    id uuid not null primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    transcript_id uuid not null references public.transcripts(id) on delete cascade,
    summary_id uuid references public.summaries(id) on delete set null,
    sentiment text,
    talk_ratio numeric,
    objection_count integer not null default 0,
    keyword_count integer not null default 0,
    recommendation text,
    provider text not null,
    created_by uuid not null references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index insights_created_at_idx
    on public.insights(created_at desc);
  create index insights_org_created_idx
    on public.insights(organization_id, created_at desc);
  create index insights_organization_idx
    on public.insights(organization_id);
  create index insights_summary_idx
    on public.insights(summary_id);
  create index insights_transcript_idx
    on public.insights(transcript_id);

  alter table public.insights enable row level security;

  create policy insights_select_active_org_members
  on public.insights
  for select
  to authenticated
  using (
    not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = insights.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'::public.member_status
    )
  );

  create policy insights_insert_active_org_members
  on public.insights
  for insert
  to authenticated
  with check (
    not public.is_active_platform_identity()
    and created_by = auth.uid()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = insights.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'::public.member_status
    )
    and exists (
      select 1
      from public.transcripts transcript
      where transcript.id = insights.transcript_id
        and transcript.organization_id = insights.organization_id
    )
    and (
      summary_id is null
      or exists (
        select 1
        from public.summaries summary
        where summary.id = insights.summary_id
          and summary.transcript_id = insights.transcript_id
          and summary.organization_id = insights.organization_id
      )
    )
  );

  create policy insights_update_active_org_members
  on public.insights
  for update
  to authenticated
  using (
    not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = insights.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'::public.member_status
    )
  )
  with check (
    not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = insights.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'::public.member_status
    )
    and exists (
      select 1
      from public.transcripts transcript
      where transcript.id = insights.transcript_id
        and transcript.organization_id = insights.organization_id
    )
    and (
      summary_id is null
      or exists (
        select 1
        from public.summaries summary
        where summary.id = insights.summary_id
          and summary.transcript_id = insights.transcript_id
          and summary.organization_id = insights.organization_id
      )
    )
  );

  create policy insights_delete_active_org_members
  on public.insights
  for delete
  to authenticated
  using (
    not public.is_active_platform_identity()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = insights.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'::public.member_status
    )
  );
end;
$repair$;

notify pgrst, 'reload schema';

commit;
