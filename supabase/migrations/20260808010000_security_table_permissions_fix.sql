begin;

-- Authenticated users must have PostgreSQL table privileges before RLS
-- policies can evaluate access. The original security migrations created
-- RLS policies but did not grant the matching table privileges.

-- Sessions: users may create, read, and refresh only their own session rows.
drop policy if exists "users insert own sessions"
  on public.user_sessions;

create policy "users insert own sessions"
on public.user_sessions
for insert
to authenticated
with check (user_id = auth.uid());

grant select, insert, update
on public.user_sessions
to authenticated;

-- Devices: users may create, read, and refresh only their own device rows.
drop policy if exists "users insert own devices"
  on public.user_devices;

create policy "users insert own devices"
on public.user_devices
for insert
to authenticated
with check (user_id = auth.uid());

grant select, insert, update
on public.user_devices
to authenticated;

-- MFA policy and status tables.
grant select, insert, update
on public.organization_mfa_policies
to authenticated;

grant select
on public.user_mfa_status
to authenticated;

-- API security configuration and events.
grant select, insert, update
on public.api_security_policies
to authenticated;

grant select
on public.api_request_events
to authenticated;

-- Threat and monitoring data.
grant select, update
on public.security_threat_events
to authenticated;

grant select
on public.security_monitoring_snapshots
to authenticated;

-- Audit logs are queried by the Security Center.
grant select
on public.audit_logs
to authenticated;

-- Secret values remain protected. Only the metadata RPC is exposed.
revoke all
on public.organization_secrets
from anon, authenticated;

revoke all
on public.secret_access_events
from anon, authenticated;

revoke select(encrypted_value)
on public.organization_secrets
from authenticated;

grant execute
on function public.list_organization_secret_metadata(uuid)
to authenticated;

commit;
