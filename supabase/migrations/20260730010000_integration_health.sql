-- Production connection-health metadata for subscriber-owned integrations.
alter table public.organization_integrations
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_status text;

alter table public.organization_integrations
  drop constraint if exists organization_integrations_last_test_status_check;
alter table public.organization_integrations
  add constraint organization_integrations_last_test_status_check
  check (last_test_status is null or last_test_status in ('passed','failed'));

grant select, insert, update, delete on public.organization_integrations to authenticated;
grant all privileges on public.organization_integrations to service_role;
grant all privileges on public.organization_integration_secrets to service_role;
