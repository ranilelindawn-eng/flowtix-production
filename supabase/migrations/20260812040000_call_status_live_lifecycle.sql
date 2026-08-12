-- Flowtix provider-neutral live call lifecycle status fix.
--
-- public.calls.status uses public.call_status. The original enum contained only:
-- completed, failed, scheduled, cancelled.
--
-- Flowtix's telephony layer already uses the following live lifecycle states for
-- Twilio, Telnyx, SignalWire, and Plivo:
-- initiating, queued, ringing, connected, on-hold.
--
-- Without these enum values, PostgREST filters such as
--   .in('status', ['initiating', 'queued', 'ringing', 'connected'])
-- fail with:
--   invalid input value for enum call_status: "initiating"
--
-- These statements are intentionally not wrapped in a transaction because newly
-- added PostgreSQL enum values must be committed before they are used by later
-- statements/requests.

alter type public.call_status add value if not exists 'initiating';
alter type public.call_status add value if not exists 'queued';
alter type public.call_status add value if not exists 'ringing';
alter type public.call_status add value if not exists 'connected';
alter type public.call_status add value if not exists 'on-hold';

notify pgrst, 'reload schema';
