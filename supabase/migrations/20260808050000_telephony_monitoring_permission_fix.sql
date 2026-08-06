begin;

-- Phase 3.8 created the telephony monitoring tables and RLS policies,
-- but omitted the PostgreSQL privileges required by the application
-- service-role client and authenticated dashboard users.

grant select
on public.telephony_monitoring_snapshots
to authenticated;

grant select
on public.telephony_alert_rules
to authenticated;

grant select, update
on public.telephony_alerts
to authenticated;

grant all
on public.telephony_monitoring_snapshots
to service_role;

grant all
on public.telephony_alert_rules
to service_role;

grant all
on public.telephony_alerts
to service_role;

grant execute
on function public.collect_telephony_monitoring_snapshot(uuid)
to authenticated, service_role;

commit;
