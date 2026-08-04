begin;

alter table public.communication_messages
  add column if not exists background_job_id uuid references public.background_jobs(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists source_record_id uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists usage_consumed_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.communication_messages
  drop constraint if exists communication_messages_status_check;

alter table public.communication_messages
  add constraint communication_messages_status_check
  check (status in ('queued','processing','sent','delivered','failed','received','cancelled'));

alter table public.communication_messages
  drop constraint if exists communication_messages_source_check;

alter table public.communication_messages
  add constraint communication_messages_source_check
  check (source in ('manual','sequence','campaign','api','system'));

create index if not exists communication_messages_delivery_queue_idx
  on public.communication_messages (organization_id, status, created_at)
  where direction = 'outbound';

create unique index if not exists communication_messages_source_record_unique_idx
  on public.communication_messages (organization_id, source, source_record_id)
  where source_record_id is not null;

create index if not exists communication_messages_background_job_idx
  on public.communication_messages (background_job_id)
  where background_job_id is not null;

create unique index if not exists communication_messages_provider_message_unique_idx
  on public.communication_messages (organization_id, provider, provider_message_id)
  where provider_message_id is not null;

create or replace function public.touch_communication_message_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists communication_messages_touch_updated_at on public.communication_messages;
create trigger communication_messages_touch_updated_at
before update on public.communication_messages
for each row execute function public.touch_communication_message_updated_at();

commit;
