begin;

-- Phase S1 lockdown. Apply only after the Flowtix application has been
-- switched to the trusted service-role rate-limit, telemetry, and
-- session/device tracking paths introduced by the preceding migration.

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  bucket_row public.rate_limit_buckets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  insert into public.rate_limit_buckets(bucket_key, request_count)
  values (p_bucket_key, 1)
  on conflict (bucket_key) do update
  set
    request_count = case
      when public.rate_limit_buckets.window_started_at <
        now() - make_interval(secs => p_window_seconds)
        then 1
      else public.rate_limit_buckets.request_count + 1
    end,
    window_started_at = case
      when public.rate_limit_buckets.window_started_at <
        now() - make_interval(secs => p_window_seconds)
        then now()
      else public.rate_limit_buckets.window_started_at
    end,
    updated_at = now()
  returning * into bucket_row;

  return bucket_row.request_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
to service_role;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Trusted Flowtix server rate-limit mutation. Browser roles cannot execute this function directly.';

revoke all on function public.record_api_request_event(
  text,
  text,
  text,
  inet,
  text,
  text
) from public, anon, authenticated, service_role;

drop function if exists public.record_api_request_event(
  text,
  text,
  text,
  inet,
  text,
  text
);

revoke all on function public.record_api_request_event(
  text,
  text,
  text,
  uuid,
  inet,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.record_api_request_event(
  text,
  text,
  text,
  uuid,
  inet,
  text,
  text
) to service_role;

revoke all on table public.user_sessions from anon, authenticated;
revoke all on table public.user_devices from anon, authenticated;
grant select on table public.user_sessions to authenticated;
grant select on table public.user_devices to authenticated;
grant select, insert, update on table public.user_sessions to service_role;
grant select, insert, update on table public.user_devices to service_role;

drop policy if exists "users insert own sessions" on public.user_sessions;
drop policy if exists "users update own sessions" on public.user_sessions;
drop policy if exists "users read own sessions" on public.user_sessions;
create policy "users read own sessions"
on public.user_sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users insert own devices" on public.user_devices;
drop policy if exists "users update own devices" on public.user_devices;
drop policy if exists "users read own devices" on public.user_devices;
create policy "users read own devices"
on public.user_devices
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.set_device_trust(
  p_device_id uuid,
  p_trusted boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_trusted then
    update public.user_devices
       set trusted_at = now()
     where id = p_device_id
       and user_id = auth.uid()
       and revoked_at is null;
  else
    update public.user_devices
       set trusted_at = null
     where id = p_device_id
       and user_id = auth.uid();
  end if;

  return found;
end;
$$;

revoke all on function public.set_device_trust(uuid, boolean) from public;
grant execute on function public.set_device_trust(uuid, boolean)
to authenticated;

comment on table public.user_sessions is
  'User-visible session inventory. Browser roles are read-only; Flowtix server paths control session security state and tracking mutations.';
comment on table public.user_devices is
  'User-visible device inventory. Browser roles are read-only; trusted RPCs and server tracking paths control device security state.';

commit;
