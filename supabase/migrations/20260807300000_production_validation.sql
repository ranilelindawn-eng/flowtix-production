begin;
create table if not exists public.production_validation_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 status text not null check(status in('running','passed','warning','failed')), score integer not null default 0 check(score between 0 and 100),
 checks jsonb not null default '[]'::jsonb, created_by uuid references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.production_validation_runs enable row level security;
create policy production_validation_runs_select on public.production_validation_runs for select to authenticated using(public.is_organization_member(organization_id));
grant select on public.production_validation_runs to authenticated;
create or replace function public.run_production_validation(p_organization_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_score integer:=100; v_status text:='passed'; v_checks jsonb; v_id uuid; v_failed_jobs integer; v_open_incidents integer; v_expired_secrets integer;
begin
 if not public.is_organization_member(p_organization_id) or public.organization_role(p_organization_id) not in('owner','admin') then raise exception 'Not authorized'; end if;
 select count(*) into v_failed_jobs from public.background_jobs where organization_id=p_organization_id and status in('failed','dead_letter');
 select count(*) into v_open_incidents from public.operational_incidents where (organization_id=p_organization_id or organization_id is null) and status<>'resolved';
 select count(*) into v_expired_secrets from public.organization_secrets where organization_id=p_organization_id and revoked_at is null and expires_at is not null and expires_at<now();
 v_score:=greatest(0,100-least(v_failed_jobs,10)*3-least(v_open_incidents,10)*5-least(v_expired_secrets,10)*4);
 v_status:=case when v_score>=90 then 'passed' when v_score>=70 then 'warning' else 'failed' end;
 v_checks:=jsonb_build_array(jsonb_build_object('key','failed_jobs','value',v_failed_jobs,'passed',v_failed_jobs=0),jsonb_build_object('key','open_incidents','value',v_open_incidents,'passed',v_open_incidents=0),jsonb_build_object('key','expired_secrets','value',v_expired_secrets,'passed',v_expired_secrets=0));
 insert into public.production_validation_runs(organization_id,status,score,checks,created_by,completed_at) values(p_organization_id,v_status,v_score,v_checks,auth.uid(),now()) returning id into v_id;
 return jsonb_build_object('runId',v_id,'score',v_score,'status',v_status);
end $$;
grant execute on function public.run_production_validation(uuid) to authenticated;
commit;
