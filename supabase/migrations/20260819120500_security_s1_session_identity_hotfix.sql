begin;

-- Phase S1 corrective migration:
-- A device fingerprint must identify a device, while auth_session_id identifies
-- one concrete Supabase Auth session. Reusing a device fingerprint as the
-- revocation key permanently locked a user out of the same browser after they
-- revoked one session.

alter table public.user_sessions
  add column if not exists device_fingerprint text;

update public.user_sessions
   set device_fingerprint = session_fingerprint
 where device_fingerprint is null;

create index if not exists user_sessions_user_device_fingerprint_idx
  on public.user_sessions(user_id, device_fingerprint)
  where device_fingerprint is not null;

-- The older partial unique index already prevents duplicate non-null
-- auth_session_id values. Add a full unique constraint so PostgREST upsert can
-- safely target (user_id, auth_session_id) with ON CONFLICT.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.user_sessions'::regclass
       and conname = 'user_sessions_user_auth_session_key'
  ) then
    alter table public.user_sessions
      add constraint user_sessions_user_auth_session_key
      unique (user_id, auth_session_id);
  end if;
end
$$;

create or replace function public.revoke_user_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_fingerprint text;
  device_was_revoked boolean := false;
begin
  update public.user_devices
     set revoked_at = coalesce(revoked_at, now()),
         trusted_at = null
   where id = p_device_id
     and user_id = auth.uid()
  returning device_fingerprint into target_fingerprint;

  device_was_revoked := found;

  if device_was_revoked and target_fingerprint is not null then
    update public.user_sessions
       set revoked_at = coalesce(revoked_at, now()),
           revoked_reason = 'device_revoked'
     where user_id = auth.uid()
       and coalesce(device_fingerprint, session_fingerprint) = target_fingerprint;
  end if;

  return device_was_revoked;
end;
$$;

revoke all on function public.revoke_user_device(uuid) from public;
grant execute on function public.revoke_user_device(uuid) to authenticated;

comment on column public.user_sessions.auth_session_id is
  'Supabase Auth session_id claim. This is the authoritative identifier for one login session and is used for revocation enforcement.';

comment on column public.user_sessions.device_fingerprint is
  'Stable Flowtix device fingerprint used only to associate sessions with a device. It is not the session revocation identity.';

commit;
