begin;

-- Flowtix telephony provider retirement.
-- SignalWire is the only active browser/PSTN provider.
-- Historical rows are preserved for call/audit history, but legacy provider
-- credentials are removed and legacy integrations/numbers are disabled.

delete from public.organization_integration_secrets secret
using public.organization_integrations integration
where secret.integration_id = integration.id
  and secret.organization_id = integration.organization_id
  and integration.provider in ('twilio', 'telnyx', 'plivo');

update public.organization_integrations
set
  enabled = false,
  status = 'disconnected',
  config = '{}'::jsonb,
  connected_by = null,
  connected_at = null,
  last_error = 'Provider retired. Flowtix telephony is SignalWire-only.',
  updated_at = pg_catalog.now()
where provider in ('twilio', 'telnyx', 'plivo');

update public.organization_phone_numbers
set
  is_default = false,
  inbound_route = null,
  recording_enabled = false,
  updated_at = pg_catalog.now()
where provider in ('twilio', 'telnyx', 'plivo');

commit;
