begin;

alter table public.attachments
  add column if not exists description text,
  add column if not exists category text not null default 'general',
  add column if not exists status text not null default 'active',
  add column if not exists version_number integer not null default 1,
  add column if not exists checksum_sha256 text,
  add column if not exists scan_status text not null default 'pending',
  add column if not exists scanned_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.attachments drop constraint if exists attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('contact','company','opportunity','campaign','comment','task','activity','calendar','call','transcript'));
alter table public.attachments add constraint attachments_category_check
  check (category in ('general','contract','proposal','invoice','recording','transcript','image','document','other'));
alter table public.attachments add constraint attachments_status_check
  check (status in ('active','archived','deleted'));
alter table public.attachments add constraint attachments_scan_status_check
  check (scan_status in ('pending','clean','blocked','failed'));
alter table public.attachments add constraint attachments_version_number_check check (version_number > 0);
alter table public.attachments add constraint attachments_checksum_check
  check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$');

create table if not exists public.attachment_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  version_number integer not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum_sha256 text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (attachment_id, version_number),
  unique (organization_id, storage_path),
  check (version_number > 0),
  check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$')
);

create table if not exists public.attachment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  action text not null check (action in ('uploaded','version_uploaded','downloaded','archived','restored','deleted','metadata_updated','scan_updated')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.attachment_versions (
  organization_id, attachment_id, version_number, file_name, storage_path,
  mime_type, size_bytes, checksum_sha256, uploaded_by, created_at, metadata
)
select a.organization_id, a.id, greatest(a.version_number, 1), a.file_name, a.storage_path,
       a.mime_type, a.size_bytes, a.checksum_sha256, a.uploaded_by, a.created_at, '{}'::jsonb
from public.attachments a
where not exists (select 1 from public.attachment_versions v where v.attachment_id = a.id);

create index if not exists attachments_org_status_created_idx on public.attachments(organization_id, status, created_at desc);
create index if not exists attachments_org_category_idx on public.attachments(organization_id, category, created_at desc);
create index if not exists attachments_checksum_idx on public.attachments(organization_id, checksum_sha256) where checksum_sha256 is not null;
create index if not exists attachment_versions_attachment_idx on public.attachment_versions(attachment_id, version_number desc);
create index if not exists attachment_events_attachment_idx on public.attachment_events(attachment_id, created_at desc);

create or replace function public.validate_attachment_entity()
returns trigger language plpgsql security definer set search_path = public as $$
declare entity_org uuid;
begin
  case new.entity_type
    when 'contact' then select organization_id into entity_org from public.contacts where id = new.entity_id;
    when 'company' then select organization_id into entity_org from public.companies where id = new.entity_id;
    when 'opportunity' then select organization_id into entity_org from public.opportunities where id = new.entity_id;
    when 'campaign' then select organization_id into entity_org from public.campaigns where id = new.entity_id;
    when 'comment' then select organization_id into entity_org from public.internal_comments where id = new.entity_id;
    when 'task' then select organization_id into entity_org from public.contact_tasks where id = new.entity_id;
    when 'activity' then select organization_id into entity_org from public.crm_activities where id = new.entity_id;
    when 'calendar' then select organization_id into entity_org from public.calendar_events where id = new.entity_id;
    when 'call' then select organization_id into entity_org from public.calls where id = new.entity_id;
    when 'transcript' then select organization_id into entity_org from public.transcripts where id = new.entity_id;
  end case;
  if entity_org is null or entity_org <> new.organization_id then
    raise exception 'ATTACHMENT_ENTITY_INVALID';
  end if;
  return new;
end; $$;

drop trigger if exists validate_attachment_entity_trigger on public.attachments;
create trigger validate_attachment_entity_trigger before insert or update of organization_id, entity_type, entity_id
on public.attachments for each row execute function public.validate_attachment_entity();

create or replace function public.touch_attachment_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists touch_attachment_updated_at_trigger on public.attachments;
create trigger touch_attachment_updated_at_trigger before update on public.attachments
for each row execute function public.touch_attachment_updated_at();

alter table public.attachment_versions enable row level security;
alter table public.attachment_events enable row level security;

drop policy if exists attachment_versions_read on public.attachment_versions;
create policy attachment_versions_read on public.attachment_versions for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists attachment_versions_insert on public.attachment_versions;
create policy attachment_versions_insert on public.attachment_versions for insert to authenticated
with check (public.is_organization_member(organization_id) and uploaded_by = auth.uid());

drop policy if exists attachment_events_read on public.attachment_events;
create policy attachment_events_read on public.attachment_events for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists attachment_events_insert on public.attachment_events;
create policy attachment_events_insert on public.attachment_events for insert to authenticated
with check (public.is_organization_member(organization_id) and (actor_user_id is null or actor_user_id = auth.uid()));

revoke all on public.attachment_versions, public.attachment_events from anon;
grant select, insert on public.attachment_versions to authenticated;
grant select, insert on public.attachment_events to authenticated;


create or replace function public.register_attachment_version(
  target_attachment_id uuid,
  target_file_name text,
  target_storage_path text,
  target_mime_type text,
  target_size_bytes bigint,
  target_checksum_sha256 text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  current_attachment public.attachments%rowtype;
  next_version integer;
begin
  select * into current_attachment from public.attachments
  where id = target_attachment_id for update;
  if current_attachment.id is null or not public.is_organization_member(current_attachment.organization_id) then
    raise exception 'ATTACHMENT_NOT_FOUND';
  end if;
  if current_attachment.status = 'deleted' then raise exception 'ATTACHMENT_DELETED'; end if;
  next_version := current_attachment.version_number + 1;
  insert into public.attachment_versions (
    organization_id, attachment_id, version_number, file_name, storage_path,
    mime_type, size_bytes, checksum_sha256, uploaded_by
  ) values (
    current_attachment.organization_id, current_attachment.id, next_version, target_file_name,
    target_storage_path, nullif(target_mime_type, ''), target_size_bytes,
    target_checksum_sha256, auth.uid()
  );
  update public.attachments set
    file_name = target_file_name,
    storage_path = target_storage_path,
    mime_type = nullif(target_mime_type, ''),
    size_bytes = target_size_bytes,
    checksum_sha256 = target_checksum_sha256,
    version_number = next_version,
    scan_status = 'pending',
    scanned_at = null,
    status = 'active',
    archived_at = null,
    archived_by = null
  where id = current_attachment.id;
  insert into public.attachment_events (organization_id, attachment_id, action, actor_user_id, metadata)
  values (current_attachment.organization_id, current_attachment.id, 'version_uploaded', auth.uid(), jsonb_build_object('version', next_version));
  return next_version;
end; $$;

revoke all on function public.register_attachment_version(uuid,text,text,text,bigint,text) from public;
grant execute on function public.register_attachment_version(uuid,text,text,text,bigint,text) to authenticated;

commit;
