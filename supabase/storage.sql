-- Supabase storage bucket definitions and tenant-aware object policies for CallFlow.
--
-- Required object path convention:
--   organization_id/user_id/file.ext
--
-- All buckets are private. Downloads require an authenticated request that
-- satisfies the SELECT policy below.

insert into storage.buckets (id, name, public)
values
  ('recordings', 'recordings', false),
  ('avatars', 'avatars', false),
  ('exports', 'exports', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

-- Make this script safe to run more than once.
drop policy if exists callflow_storage_select on storage.objects;
drop policy if exists callflow_storage_insert on storage.objects;
drop policy if exists callflow_storage_update on storage.objects;
drop policy if exists callflow_storage_delete on storage.objects;

-- Active organization members may read files belonging to their organization.
create policy callflow_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id in ('recordings', 'avatars', 'exports')
  and auth.uid() is not null
  and public.is_org_member(
    ((storage.foldername(name))[1])::uuid
  )
);

-- Writers may upload recordings and exports.
--
-- Avatar uploads are restricted to the authenticated user's own folder:
--   organization_id/auth.uid()/file.ext
create policy callflow_storage_insert
on storage.objects
for insert
to authenticated
with check (
  auth.uid() is not null
  and (
    (
      bucket_id in ('recordings', 'exports')
      and public.is_org_writer(
        ((storage.foldername(name))[1])::uuid
      )
    )
    or
    (
      bucket_id = 'avatars'
      and public.is_org_member(
        ((storage.foldername(name))[1])::uuid
      )
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

-- Writers may update recordings and exports.
--
-- Users may update only avatars stored inside their own user folder.
create policy callflow_storage_update
on storage.objects
for update
to authenticated
using (
  auth.uid() is not null
  and (
    (
      bucket_id in ('recordings', 'exports')
      and public.is_org_writer(
        ((storage.foldername(name))[1])::uuid
      )
    )
    or
    (
      bucket_id = 'avatars'
      and public.is_org_member(
        ((storage.foldername(name))[1])::uuid
      )
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
)
with check (
  auth.uid() is not null
  and (
    (
      bucket_id in ('recordings', 'exports')
      and public.is_org_writer(
        ((storage.foldername(name))[1])::uuid
      )
    )
    or
    (
      bucket_id = 'avatars'
      and public.is_org_member(
        ((storage.foldername(name))[1])::uuid
      )
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

-- Only organization admins may delete recordings and exports.
--
-- Users may delete only avatars stored inside their own user folder.
create policy callflow_storage_delete
on storage.objects
for delete
to authenticated
using (
  auth.uid() is not null
  and (
    (
      bucket_id in ('recordings', 'exports')
      and public.is_org_admin(
        ((storage.foldername(name))[1])::uuid
      )
    )
    or
    (
      bucket_id = 'avatars'
      and public.is_org_member(
        ((storage.foldername(name))[1])::uuid
      )
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);