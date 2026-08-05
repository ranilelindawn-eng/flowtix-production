begin;
create table if not exists public.security_monitoring_snapshots(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 open_threats integer not null default 0, critical_threats integer not null default 0, active_sessions integer not null default 0,
 trusted_devices integer not null default 0, failed_audit_events_24h integer not null default 0, blocked_api_requests_24h integer not null default 0,
 expired_secrets integer not null default 0, risk_score integer not null default 0 check(risk_score between 0 and 100), captured_by uuid references auth.users(id) on delete set null,
 captured_at timestamptz not null default now());
create index if not exists security_monitoring_org_time_idx on public.security_monitoring_snapshots(organization_id,captured_at desc);
alter table public.security_monitoring_snapshots enable row level security;
drop policy if exists "admins read security snapshots" on public.security_monitoring_snapshots;
create policy "admins read security snapshots" on public.security_monitoring_snapshots for select using(exists(select 1 from public.organization_members m where m.organization_id=security_monitoring_snapshots.organization_id and m.user_id=auth.uid() and m.role in('owner','admin')));
create or replace function public.capture_security_monitoring_snapshot(p_organization_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_open int; v_critical int; v_sessions int; v_devices int; v_failed int; v_blocked int; v_expired int; v_risk int;
begin
 if not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role in('owner','admin')) then raise exception 'forbidden'; end if;
 select count(*),count(*) filter(where severity='critical') into v_open,v_critical from public.security_threat_events where organization_id=p_organization_id and status in('open','investigating');
 select count(*) into v_sessions from public.user_sessions where organization_id=p_organization_id and revoked_at is null and expires_at>now();
 select count(*) into v_devices from public.user_devices where organization_id=p_organization_id and trusted_at is not null and revoked_at is null;
 select count(*) into v_failed from public.audit_logs where organization_id=p_organization_id and outcome in('failure','denied') and created_at>=now()-interval '24 hours';
 select count(*) into v_blocked from public.api_request_events where organization_id=p_organization_id and blocked_reason is not null and created_at>=now()-interval '24 hours';
 select count(*) into v_expired from public.organization_secrets where organization_id=p_organization_id and revoked_at is null and expires_at is not null and expires_at<=now();
 v_risk:=least(100,v_critical*25+greatest(v_open-v_critical,0)*8+least(v_failed,20)+least(v_blocked/5,20)+v_expired*5);
 insert into public.security_monitoring_snapshots(organization_id,open_threats,critical_threats,active_sessions,trusted_devices,failed_audit_events_24h,blocked_api_requests_24h,expired_secrets,risk_score,captured_by)
 values(p_organization_id,v_open,v_critical,v_sessions,v_devices,v_failed,v_blocked,v_expired,v_risk,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.capture_security_monitoring_snapshot(uuid) from public; grant execute on function public.capture_security_monitoring_snapshot(uuid) to authenticated;
commit;
