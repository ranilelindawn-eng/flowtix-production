begin;

-- API and MFA policy configuration is never anonymous database data.
-- Authenticated access remains governed by the existing organization RLS policies.
revoke all on table public.api_security_policies from anon;
revoke all on table public.organization_mfa_policies from anon;

grant select, insert, update on table public.api_security_policies to authenticated;
grant select, insert, update on table public.organization_mfa_policies to authenticated;

grant all on table public.api_security_policies to service_role;
grant all on table public.organization_mfa_policies to service_role;

commit;
