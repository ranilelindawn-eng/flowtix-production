begin;

-- Phase D.3: storage bucket, object path, tenant isolation, and metadata integrity hardening.

create or replace function public.storage_path_segment_uuid(target_name text, segment_index integer)
returns uuid
language plpgsql
immutable
strict
set search_path = public, storage, pg_catalog
as $$
declare
  segment text;
begin
  if segment_index < 1 then
    return null;
  end if;

  segment := (storage.foldername(target_name))[segment_index];
  if segment is null or segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return segment::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.storage_path_segment_uuid(text, integer) from public, anon;
grant execute on function public.storage_path_segment_uuid(text, integer) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('crm-attachments', 'crm-attachments', false, 26214400, null),
  ('recordings', 'recordings', false, 104857600, array[
    'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/webm','audio/ogg',
    'video/mp4','video/webm','application/octet-stream'
  ]::text[]),
  ('exports', 'exports', false, 104857600, array[
    'text/csv','application/pdf','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'
  ]::text[]),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']::text[]),
  ('organization-logos', 'organization-logos', true, 2097152, array['image/jpeg','image/png','image/webp','image/svg+xml']::text[])
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- IMPORTANT: storage.objects is owned by Supabase's managed
-- supabase_storage_admin role. Hosted-project SQL Editor and normal
-- migrations cannot assume that role. Object policies are therefore
-- configured through the Supabase Storage policy UI using the companion
-- PHASE-D3-STORAGE-POLICIES.md instructions. The database migration remains
-- transactional and does not attempt privileged DDL on storage.objects.

-- Database metadata must point to an object path owned by the same tenant and entity.
create or replace function public.validate_attachment_storage_path()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  expected_prefix text;
begin
  expected_prefix := new.organization_id::text || '/' || new.entity_type || '/' || new.entity_id::text || '/' || new.id::text || '/';
  if new.storage_path is null or left(new.storage_path, length(expected_prefix)) <> expected_prefix then
    raise exception 'ATTACHMENT_STORAGE_PATH_INVALID';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_attachment_storage_path_trigger on public.attachments;
create trigger validate_attachment_storage_path_trigger
before insert or update of id, organization_id, entity_type, entity_id, storage_path
on public.attachments
for each row execute function public.validate_attachment_storage_path();

create or replace function public.validate_attachment_version_storage_path()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  parent public.attachments%rowtype;
  expected_prefix text;
begin
  select * into parent from public.attachments where id = new.attachment_id;
  if parent.id is null or parent.organization_id <> new.organization_id then
    raise exception 'ATTACHMENT_VERSION_TENANT_INVALID';
  end if;
  expected_prefix := parent.organization_id::text || '/' || parent.entity_type || '/' || parent.entity_id::text || '/' || parent.id::text || '/';
  if new.storage_path is null or left(new.storage_path, length(expected_prefix)) <> expected_prefix then
    raise exception 'ATTACHMENT_VERSION_STORAGE_PATH_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_attachment_version_storage_path() from public, anon, authenticated;

drop trigger if exists validate_attachment_version_storage_path_trigger on public.attachment_versions;
create trigger validate_attachment_version_storage_path_trigger
before insert or update of organization_id, attachment_id, storage_path
on public.attachment_versions
for each row execute function public.validate_attachment_version_storage_path();

-- Prevent cross-tenant metadata links even when IDs are supplied directly.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachments_org_id_id_unique'
      and conrelid = 'public.attachments'::regclass
  ) then
    alter table public.attachments add constraint attachments_org_id_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attachment_versions_org_attachment_fk'
      and conrelid = 'public.attachment_versions'::regclass
  ) then
    alter table public.attachment_versions
      add constraint attachment_versions_org_attachment_fk
      foreign key (organization_id, attachment_id)
      references public.attachments(organization_id, id)
      on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attachment_events_org_attachment_fk'
      and conrelid = 'public.attachment_events'::regclass
  ) then
    alter table public.attachment_events
      add constraint attachment_events_org_attachment_fk
      foreign key (organization_id, attachment_id)
      references public.attachments(organization_id, id)
      on delete cascade not valid;
  end if;
end $$;

create index if not exists attachment_versions_org_storage_idx
  on public.attachment_versions(organization_id, storage_path);
create index if not exists attachments_org_storage_idx
  on public.attachments(organization_id, storage_path);

-- Service-role report for missing metadata objects and unreferenced tenant objects.
create or replace function public.storage_integrity_report(target_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  missing_attachment_objects bigint;
  missing_attachment_version_objects bigint;
  missing_recording_objects bigint;
  missing_export_objects bigint;
  orphan_attachment_objects bigint;
  malformed_private_paths bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  select count(*) into missing_attachment_objects
  from public.attachments a
  where (target_organization_id is null or a.organization_id = target_organization_id)
    and a.status <> 'deleted'
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'crm-attachments' and o.name = a.storage_path
    );

  select count(*) into missing_attachment_version_objects
  from public.attachment_versions v
  where (target_organization_id is null or v.organization_id = target_organization_id)
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'crm-attachments' and o.name = v.storage_path
    );

  select count(*) into missing_recording_objects
  from public.recordings r
  where (target_organization_id is null or r.organization_id = target_organization_id)
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = r.bucket_name and o.name = r.storage_path
    );

  select count(*) into missing_export_objects
  from public.export_jobs e
  where e.storage_path is not null
    and (target_organization_id is null or e.organization_id = target_organization_id)
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = coalesce(e.storage_bucket, 'exports') and o.name = e.storage_path
    );

  select count(*) into orphan_attachment_objects
  from storage.objects o
  where o.bucket_id = 'crm-attachments'
    and (target_organization_id is null or public.storage_path_segment_uuid(o.name, 1) = target_organization_id)
    and not exists (select 1 from public.attachment_versions v where v.storage_path = o.name)
    and not exists (select 1 from public.attachments a where a.storage_path = o.name);

  select count(*) into malformed_private_paths
  from storage.objects o
  where o.bucket_id in ('crm-attachments', 'recordings', 'exports')
    and public.storage_path_segment_uuid(o.name, 1) is null;

  return jsonb_build_object(
    'healthy', missing_attachment_objects = 0
      and missing_attachment_version_objects = 0
      and missing_recording_objects = 0
      and missing_export_objects = 0
      and orphan_attachment_objects = 0
      and malformed_private_paths = 0,
    'missingAttachmentObjects', missing_attachment_objects,
    'missingAttachmentVersionObjects', missing_attachment_version_objects,
    'missingRecordingObjects', missing_recording_objects,
    'missingExportObjects', missing_export_objects,
    'orphanAttachmentObjects', orphan_attachment_objects,
    'malformedPrivatePaths', malformed_private_paths,
    'checkedAt', now()
  );
end;
$$;

revoke all on function public.storage_integrity_report(uuid) from public, anon, authenticated;
grant execute on function public.storage_integrity_report(uuid) to service_role;

commit;
