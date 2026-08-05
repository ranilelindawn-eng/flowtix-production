begin;
create table if not exists public.platform_operational_snapshots(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,open_jobs integer not null default 0,failed_jobs integer not null default 0,open_threats integer not null default 0,active_members integer not null default 0,active_integrations integer not null default 0,risk_score integer not null default 0,metadata jsonb not null default '{}'::jsonb,captured_by uuid references auth.users(id) on delete set null,captured_at timestamptz not null default now());
create index if not exists platform_ops_org_time_idx on public.platform_operational_snapshots(organization_id,captured_at desc);
alter table public.platform_operational_snapshots enable row level security;
create policy "admins read operational snapshots" on public.platform_operational_snapshots for select using(exists(select 1 from public.organization_members m where m.organization_id=platform_operational_snapshots.organization_id and m.user_id=auth.uid() and m.role in('owner','admin')));

create or replace function public.get_platform_admin_overview() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_role text; v_result jsonb;
begin
 select organization_id,role into v_org,v_role from public.get_current_organization_membership() limit 1;
 if v_org is null or v_role not in('owner','admin') then raise exception 'forbidden'; end if;
 select jsonb_build_object(
  'organization',jsonb_build_object('id',o.id,'name',o.name,'status',coalesce(o.status,'active'),'slug',o.slug),
  'counts',jsonb_build_object(
   'members',(select count(*) from public.organization_members m where m.organization_id=v_org and coalesce(m.status,'active')='active'),
   'teams',(select count(*) from public.organization_teams t where t.organization_id=v_org and t.is_active),
   'roles',(select count(*) from public.organization_roles r where r.organization_id=v_org and r.is_active),
   'featureFlags',(select count(*) from public.platform_feature_flags),
   'openJobs',(select count(*) from public.background_jobs j where j.organization_id=v_org and j.status in('queued','processing','retrying')),
   'failedJobs',(select count(*) from public.background_jobs j where j.organization_id=v_org and j.status in('failed','dead_letter')),
   'openThreats',(select count(*) from public.security_threat_events s where s.organization_id=v_org and s.status in('open','investigating'))),
  'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'userId',m.user_id,'email',p.email,'fullName',p.full_name,'role',m.role,'status',coalesce(m.status,'active'),'teamNames',coalesce((select jsonb_agg(t.name order by t.name) from public.organization_team_members tm join public.organization_teams t on t.id=tm.team_id where tm.membership_id=m.id),'[]'::jsonb)) order by coalesce(p.full_name,p.email)) from public.organization_members m left join public.profiles p on p.id=m.user_id where m.organization_id=v_org),'[]'::jsonb),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'memberCount',(select count(*) from public.organization_team_members tm where tm.team_id=t.id),'isActive',t.is_active) order by t.name) from public.organization_teams t where t.organization_id=v_org),'[]'::jsonb),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'description',r.description,'permissionCount',(select count(*) from public.organization_role_permissions rp where rp.role_id=r.id),'isSystem',r.is_system) order by r.name) from public.organization_roles r where r.organization_id=v_org),'[]'::jsonb),
  'featureFlags',coalesce((select jsonb_agg(jsonb_build_object('key',f.flag_key,'name',f.name,'enabled',coalesce(x.enabled,f.default_enabled),'rolloutPercentage',coalesce(x.rollout_percentage,f.rollout_percentage)) order by f.name) from public.platform_feature_flags f left join public.organization_feature_flag_overrides x on x.flag_key=f.flag_key and x.organization_id=v_org),'[]'::jsonb),
  'configuration',coalesce((select jsonb_agg(jsonb_build_object('key',c.config_key,'value',case when c.is_sensitive then '"[REDACTED]"'::jsonb else c.config_value end,'description',c.description,'isSensitive',c.is_sensitive) order by c.config_key) from public.organization_system_configuration c where c.organization_id=v_org),'[]'::jsonb),
  'operations',jsonb_build_array(
   jsonb_build_object('metric','Queued and running jobs','value',(select count(*) from public.background_jobs j where j.organization_id=v_org and j.status in('queued','processing','retrying')),'status',case when (select count(*) from public.background_jobs j where j.organization_id=v_org and j.status in('queued','processing','retrying'))>100 then 'warning' else 'healthy' end),
   jsonb_build_object('metric','Failed jobs','value',(select count(*) from public.background_jobs j where j.organization_id=v_org and j.status in('failed','dead_letter')),'status',case when (select count(*) from public.background_jobs j where j.organization_id=v_org and j.status in('failed','dead_letter'))>0 then 'critical' else 'healthy' end),
   jsonb_build_object('metric','Open security threats','value',(select count(*) from public.security_threat_events s where s.organization_id=v_org and s.status in('open','investigating')),'status',case when (select count(*) from public.security_threat_events s where s.organization_id=v_org and s.status in('open','investigating') and s.severity in('high','critical'))>0 then 'critical' else 'healthy' end)
  )) into v_result from public.organizations o where o.id=v_org;
 return v_result;
end $$;

create or replace function public.execute_platform_admin_command(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_role text; v_id uuid; v_key text; v_permissions jsonb;
begin
 select organization_id,role into v_org,v_role from public.get_current_organization_membership() limit 1;
 if v_org is null or v_role not in('owner','admin') then raise exception 'forbidden'; end if;
 if p_action='update_organization' then
  update public.organizations set name=coalesce(nullif(trim(p_payload->>'name'),''),name),slug=case when p_payload ? 'slug' then nullif(lower(trim(p_payload->>'slug')),'') else slug end,status=case when p_payload->>'status' in('active','suspended','archived') then p_payload->>'status' else status end,updated_at=now() where id=v_org;
  insert into public.organization_lifecycle_events(organization_id,event_type,resulting_state,actor_user_id) values(v_org,'organization.updated',p_payload,auth.uid());
 elsif p_action='create_team' then
  if nullif(trim(p_payload->>'name'),'') is null then raise exception 'team name required'; end if;
  insert into public.organization_teams(organization_id,name,description,created_by) values(v_org,trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),auth.uid()) returning id into v_id;
 elsif p_action='update_member' then
  if v_role<>'owner' and exists(select 1 from public.organization_members where id=(p_payload->>'membershipId')::uuid and role='owner') then raise exception 'only owners can manage owners'; end if;
  update public.organization_members set role=case when p_payload->>'role' in('owner','admin','manager','agent') then p_payload->>'role' else role end,status=case when p_payload->>'status' in('active','suspended') then p_payload->>'status' else status end where id=(p_payload->>'membershipId')::uuid and organization_id=v_org;
  if p_payload ? 'teamId' then delete from public.organization_team_members where membership_id=(p_payload->>'membershipId')::uuid; if nullif(p_payload->>'teamId','') is not null then insert into public.organization_team_members(team_id,membership_id) select (p_payload->>'teamId')::uuid,(p_payload->>'membershipId')::uuid where exists(select 1 from public.organization_teams where id=(p_payload->>'teamId')::uuid and organization_id=v_org); end if; end if;
 elsif p_action='create_role' then
  if nullif(trim(p_payload->>'name'),'') is null then raise exception 'role name required'; end if;
  insert into public.organization_roles(organization_id,name,description,created_by) values(v_org,trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),auth.uid()) returning id into v_id;
  v_permissions:=coalesce(p_payload->'permissions','[]'::jsonb);
  insert into public.organization_role_permissions(role_id,permission_key,granted_by) select v_id,value #>> '{}',auth.uid() from jsonb_array_elements(v_permissions) where exists(select 1 from public.permission_catalog where permission_key=value #>> '{}') on conflict do nothing;
 elsif p_action='set_feature_flag' then
  v_key:=p_payload->>'key'; if not exists(select 1 from public.platform_feature_flags where flag_key=v_key) then raise exception 'unknown feature flag'; end if;
  insert into public.organization_feature_flag_overrides(organization_id,flag_key,enabled,rollout_percentage,updated_by) values(v_org,v_key,coalesce((p_payload->>'enabled')::boolean,false),coalesce((p_payload->>'rolloutPercentage')::integer,100),auth.uid()) on conflict(organization_id,flag_key) do update set enabled=excluded.enabled,rollout_percentage=excluded.rollout_percentage,updated_by=auth.uid(),updated_at=now();
 elsif p_action='set_configuration' then
  v_key=nullif(trim(p_payload->>'key'),''); if v_key is null then raise exception 'configuration key required'; end if;
  insert into public.organization_system_configuration(organization_id,config_key,config_value,description,updated_by) values(v_org,v_key,coalesce(p_payload->'value','null'::jsonb),nullif(trim(p_payload->>'description'),''),auth.uid()) on conflict(organization_id,config_key) do update set config_value=excluded.config_value,description=coalesce(excluded.description,organization_system_configuration.description),updated_by=auth.uid(),updated_at=now();
 else raise exception 'unsupported administration command'; end if;
 return jsonb_build_object('ok',true,'action',p_action,'id',v_id);
end $$;
revoke all on function public.get_platform_admin_overview() from public; grant execute on function public.get_platform_admin_overview() to authenticated;
revoke all on function public.execute_platform_admin_command(text,jsonb) from public; grant execute on function public.execute_platform_admin_command(text,jsonb) to authenticated;
commit;
