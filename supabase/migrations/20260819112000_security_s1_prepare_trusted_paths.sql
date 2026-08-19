begin;

-- Phase S1 preparation: add trusted server-only paths before revoking any
-- existing customer-role privileges. This migration is intentionally safe to
-- apply before the application code cutover.

create or replace function public.record_api_request_event(
  p_request_id text,
  p_method text,
  p_path text,
  p_user_id uuid,
  p_ip_address inet default null,
  p_user_agent text default null,
  p_blocked_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  event_id uuid;
  organization_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  if p_user_id is not null then
    select p.organization_id
      into organization_id
      from public.profiles p
     where p.id = p_user_id;
  end if;

  insert into public.api_request_events(
    organization_id,
    user_id,
    request_id,
    method,
    path,
    ip_address,
    user_agent,
    blocked_reason
  )
  values(
    organization_id,
    p_user_id,
    p_request_id,
    p_method,
    p_path,
    p_ip_address,
    p_user_agent,
    p_blocked_reason
  )
  returning id into event_id;

  return event_id;
end;
$$;

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

grant usage on schema public to service_role;
grant select, insert, update on table public.user_sessions to service_role;
grant select, insert, update on table public.user_devices to service_role;

comment on function public.record_api_request_event(
  text,
  text,
  text,
  uuid,
  inet,
  text,
  text
) is
  'Trusted Flowtix server telemetry writer. The caller must use the service role and pass only a server-verified user id.';

commit;
