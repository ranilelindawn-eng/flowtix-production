begin;
create table if not exists public.launch_readiness_audits (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 status text not null check(status in('draft','ready','blocked','approved')), score integer not null default 0 check(score between 0 and 100),
 findings jsonb not null default '[]'::jsonb, approved_by uuid references auth.users(id), approved_at timestamptz,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.launch_readiness_audits enable row level security;
create policy launch_readiness_audits_select on public.launch_readiness_audits for select to authenticated using(public.is_organization_member(organization_id));
grant select on public.launch_readiness_audits to authenticated;
create or replace function public.get_production_readiness_overview() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_role text; v_failed_jobs integer; v_open_incidents integer; v_critical_incidents integer; v_logs integer; v_score integer; v_status text; v_validation jsonb; v_audit jsonb; v_incidents jsonb; v_backups jsonb;
begin
 select organization_id,role into v_org,v_role from public.get_current_organization_membership() limit 1;
 if v_org is null or v_role not in('owner','admin') then raise exception 'Not authorized'; end if;
 select count(*) into v_failed_jobs from public.background_jobs where organization_id=v_org and status in('failed','dead_letter');
 select count(*) into v_open_incidents from public.operational_incidents where (organization_id=v_org or organization_id is null) and status<>'resolved';
 select count(*) into v_critical_incidents from public.operational_incidents where (organization_id=v_org or organization_id is null) and status<>'resolved' and severity='critical';
 select count(*) into v_logs from public.application_logs where (organization_id=v_org or organization_id is null) and level in('error','critical') and occurred_at>now()-interval '24 hours';
 v_score:=greatest(0,100-least(v_failed_jobs,10)*3-least(v_open_incidents,10)*4-least(v_critical_incidents,5)*8-least(v_logs,20));
 v_status:=case when v_score>=90 then 'healthy' when v_score>=70 then 'warning' else 'critical' end;
 select jsonb_build_object('id',id,'status',status,'score',score,'createdAt',created_at) into v_validation from public.production_validation_runs where organization_id=v_org order by created_at desc limit 1;
 select jsonb_build_object('id',id,'status',status,'score',score,'createdAt',created_at) into v_audit from public.launch_readiness_audits where organization_id=v_org order by created_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'severity',severity,'status',status,'createdAt',created_at) order by created_at desc),'[]'::jsonb) into v_incidents from (select * from public.operational_incidents where (organization_id=v_org or organization_id is null) and status<>'resolved' order by created_at desc limit 10) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'backupType',backup_type,'createdAt',created_at) order by created_at desc),'[]'::jsonb) into v_backups from (select * from public.disaster_recovery_records where organization_id=v_org or organization_id is null order by created_at desc limit 10) x;
 return jsonb_build_object('generatedAt',now(),'score',v_score,'status',v_status,'metrics',jsonb_build_array(
 jsonb_build_object('key','failed_jobs','label','Failed jobs','value',v_failed_jobs,'status',case when v_failed_jobs=0 then 'healthy' when v_failed_jobs<5 then 'warning' else 'critical' end,'detail','Failed or dead-letter background jobs'),
 jsonb_build_object('key','open_incidents','label','Open incidents','value',v_open_incidents,'status',case when v_open_incidents=0 then 'healthy' when v_critical_incidents=0 then 'warning' else 'critical' end,'detail','Unresolved operational incidents'),
 jsonb_build_object('key','critical_incidents','label','Critical incidents','value',v_critical_incidents,'status',case when v_critical_incidents=0 then 'healthy' else 'critical' end,'detail','Critical incidents requiring immediate action'),
 jsonb_build_object('key','error_logs','label','24h error logs','value',v_logs,'status',case when v_logs=0 then 'healthy' when v_logs<10 then 'warning' else 'critical' end,'detail','Error and critical application logs in the last 24 hours')
 ),'latestValidation',v_validation,'latestLaunchAudit',v_audit,'incidents',v_incidents,'backups',v_backups);
end $$;
grant execute on function public.get_production_readiness_overview() to authenticated;
commit;
