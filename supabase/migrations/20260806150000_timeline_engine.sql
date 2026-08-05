begin;

create table if not exists public.crm_timeline_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  event_type text not null check (event_type in ('call','note','task','activity','calendar','opportunity','system','other')),
  event_action text not null check (char_length(event_action) between 1 and 80),
  source_table text not null check (char_length(source_table) between 1 and 80),
  source_id uuid not null,
  event_key text not null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  occurred_at timestamptz not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  owner_membership_id uuid references public.organization_members(id) on delete set null,
  visibility text not null default 'organization' check (visibility in ('private','team','organization')),
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, event_key)
);

create index if not exists crm_timeline_org_occurred_idx on public.crm_timeline_events(organization_id, occurred_at desc, id desc);
create index if not exists crm_timeline_contact_idx on public.crm_timeline_events(contact_id, occurred_at desc, id desc) where contact_id is not null;
create index if not exists crm_timeline_company_idx on public.crm_timeline_events(company_id, occurred_at desc, id desc) where company_id is not null;
create index if not exists crm_timeline_opportunity_idx on public.crm_timeline_events(opportunity_id, occurred_at desc, id desc) where opportunity_id is not null;
create index if not exists crm_timeline_type_idx on public.crm_timeline_events(organization_id, event_type, occurred_at desc);
create index if not exists crm_timeline_source_idx on public.crm_timeline_events(organization_id, source_table, source_id);

create or replace function public.write_crm_timeline_event(
  p_organization_id uuid,
  p_contact_id uuid,
  p_company_id uuid,
  p_opportunity_id uuid,
  p_event_type text,
  p_event_action text,
  p_source_table text,
  p_source_id uuid,
  p_event_key text,
  p_title text,
  p_description text,
  p_occurred_at timestamptz,
  p_actor_user_id uuid,
  p_owner_membership_id uuid,
  p_visibility text,
  p_payload jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare result_id uuid;
begin
  if p_organization_id is null or p_source_id is null then return null; end if;
  insert into public.crm_timeline_events (
    organization_id, contact_id, company_id, opportunity_id, event_type, event_action,
    source_table, source_id, event_key, title, description, occurred_at, actor_user_id,
    owner_membership_id, visibility, payload, metadata
  ) values (
    p_organization_id, p_contact_id, p_company_id, p_opportunity_id, p_event_type, p_event_action,
    p_source_table, p_source_id, p_event_key, left(coalesce(nullif(p_title,''),'CRM activity'),300),
    p_description, coalesce(p_occurred_at,now()), p_actor_user_id, p_owner_membership_id,
    case when p_visibility in ('private','team','organization') then p_visibility else 'organization' end,
    coalesce(p_payload,'{}'::jsonb), coalesce(p_metadata,'{}'::jsonb)
  ) on conflict (organization_id,event_key) do nothing returning id into result_id;
  return result_id;
end $$;

create or replace function public.capture_crm_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  row_data jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data jsonb := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  org_id uuid; contact_id_value uuid; company_id_value uuid; opportunity_id_value uuid;
  source_uuid uuid; actor_id uuid; owner_id uuid;
  event_kind text; action_name text; event_title text; event_description text;
  happened_at timestamptz; event_visibility text; revision_value text; key_value text;
begin
  org_id := nullif(row_data->>'organization_id','')::uuid;
  source_uuid := nullif(row_data->>'id','')::uuid;
  contact_id_value := nullif(row_data->>'contact_id','')::uuid;
  company_id_value := nullif(row_data->>'company_id','')::uuid;
  opportunity_id_value := case when tg_table_name='opportunities' then source_uuid else nullif(row_data->>'opportunity_id','')::uuid end;
  actor_id := coalesce(nullif(row_data->>'created_by','')::uuid, auth.uid());
  owner_id := nullif(row_data->>'owner_membership_id','')::uuid;
  if contact_id_value is not null and not exists(select 1 from public.contacts where id=contact_id_value) then contact_id_value := null; end if;
  if company_id_value is not null and not exists(select 1 from public.companies where id=company_id_value) then company_id_value := null; end if;
  if opportunity_id_value is not null and not exists(select 1 from public.opportunities where id=opportunity_id_value) then opportunity_id_value := null; end if;
  event_visibility := coalesce(row_data->>'visibility','organization');
  action_name := lower(tg_op);

  if tg_table_name='calls' then
    event_kind := 'call';
    event_title := initcap(coalesce(row_data->>'direction','')) || ' call';
    event_description := coalesce(row_data->>'notes', row_data->>'status');
    happened_at := coalesce(nullif(row_data->>'started_at','')::timestamptz, nullif(row_data->>'created_at','')::timestamptz, now());
  elsif tg_table_name='contact_notes' then
    event_kind := 'note'; event_title := 'Contact note'; event_description := row_data->>'body';
    happened_at := coalesce(nullif(row_data->>'created_at','')::timestamptz, now());
  elsif tg_table_name='contact_tasks' then
    event_kind := 'task'; event_title := coalesce(row_data->>'title','Task'); event_description := row_data->>'description';
    happened_at := coalesce(nullif(row_data->>'due_at','')::timestamptz, nullif(row_data->>'created_at','')::timestamptz, now());
  elsif tg_table_name='crm_activities' then
    event_kind := 'activity'; event_title := coalesce(row_data->>'subject','CRM activity'); event_description := row_data->>'body';
    happened_at := coalesce(nullif(row_data->>'occurred_at','')::timestamptz, now());
  elsif tg_table_name='calendar_events' then
    event_kind := 'calendar'; event_title := coalesce(row_data->>'title','Calendar event'); event_description := row_data->>'description';
    happened_at := coalesce(nullif(row_data->>'starts_at','')::timestamptz, now());
  elsif tg_table_name='opportunities' then
    event_kind := 'opportunity'; event_title := coalesce(row_data->>'name','Opportunity'); event_description := row_data->>'next_step';
    happened_at := coalesce(nullif(row_data->>'updated_at','')::timestamptz, nullif(row_data->>'created_at','')::timestamptz, now());
  else
    event_kind := 'other'; event_title := initcap(replace(tg_table_name,'_',' ')); event_description := null;
    happened_at := coalesce(nullif(row_data->>'updated_at','')::timestamptz, nullif(row_data->>'created_at','')::timestamptz, now());
  end if;

  if tg_op='UPDATE' then
    if coalesce(old_data->>'status','') is distinct from coalesce(row_data->>'status','') then
      action_name := 'status_changed';
      event_description := concat_ws(' → ', old_data->>'status', row_data->>'status');
    elsif coalesce(old_data->>'stage_id','') is distinct from coalesce(row_data->>'stage_id','') then
      action_name := 'stage_changed';
    else action_name := 'updated'; end if;
  elsif tg_op='INSERT' then action_name := 'created';
  else action_name := 'deleted'; end if;

  revision_value := coalesce(row_data->>'updated_at', row_data->>'created_at', row_data->>'occurred_at', row_data->>'started_at', clock_timestamp()::text);
  key_value := md5(concat_ws(':',tg_table_name,source_uuid::text,action_name,revision_value));

  perform public.write_crm_timeline_event(org_id,contact_id_value,company_id_value,opportunity_id_value,event_kind,action_name,tg_table_name,source_uuid,key_value,event_title,event_description,happened_at,actor_id,owner_id,event_visibility,row_data,jsonb_build_object('trigger_operation',tg_op));
  return case when tg_op='DELETE' then old else new end;
end $$;

-- Attach to existing CRM sources. Generic JSON extraction keeps the engine decoupled from source schemas.
do $$
declare table_name text;
begin
  foreach table_name in array array['calls','contact_notes','contact_tasks','crm_activities','calendar_events','opportunities'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists %I on public.%I', 'capture_'||table_name||'_timeline', table_name);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.capture_crm_timeline_event()', 'capture_'||table_name||'_timeline', table_name);
    end if;
  end loop;
end $$;

-- Backfill a baseline event for existing rows without duplicating trigger-created events.
do $$
declare table_name text;
begin
  foreach table_name in array array['calls','contact_notes','contact_tasks','crm_activities','calendar_events','opportunities'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('update public.%I set id=id where false', table_name);
      execute format($fmt$
        insert into public.crm_timeline_events(organization_id,contact_id,company_id,opportunity_id,event_type,event_action,source_table,source_id,event_key,title,description,occurred_at,actor_user_id,owner_membership_id,visibility,payload,metadata)
        select
          nullif(j->>'organization_id','')::uuid,
          nullif(j->>'contact_id','')::uuid,
          nullif(j->>'company_id','')::uuid,
          case when %L='opportunities' then nullif(j->>'id','')::uuid else nullif(j->>'opportunity_id','')::uuid end,
          case %L when 'calls' then 'call' when 'contact_notes' then 'note' when 'contact_tasks' then 'task' when 'crm_activities' then 'activity' when 'calendar_events' then 'calendar' when 'opportunities' then 'opportunity' else 'other' end,
          'created', %L, nullif(j->>'id','')::uuid,
          md5(concat_ws(':',%L,j->>'id','baseline')),
          left(coalesce(j->>'title',j->>'subject',j->>'name',case when %L='calls' then initcap(coalesce(j->>'direction',''))||' call' when %L='contact_notes' then 'Contact note' else 'CRM activity' end),300),
          coalesce(j->>'description',j->>'body',j->>'notes'),
          coalesce(nullif(j->>'occurred_at','')::timestamptz,nullif(j->>'started_at','')::timestamptz,nullif(j->>'starts_at','')::timestamptz,nullif(j->>'created_at','')::timestamptz,now()),
          nullif(j->>'created_by','')::uuid,nullif(j->>'owner_membership_id','')::uuid,
          case when j->>'visibility' in ('private','team','organization') then j->>'visibility' else 'organization' end,
          j,jsonb_build_object('backfilled',true)
        from (select to_jsonb(t) j from public.%I t) rows
        where nullif(j->>'organization_id','') is not null and nullif(j->>'id','') is not null
        on conflict (organization_id,event_key) do nothing
      $fmt$,table_name,table_name,table_name,table_name,table_name,table_name,table_name);
    end if;
  end loop;
end $$;

alter table public.crm_timeline_events enable row level security;
create policy crm_timeline_select on public.crm_timeline_events for select to authenticated using (
  public.is_org_member(organization_id)
  and (visibility <> 'private' or actor_user_id=auth.uid() or exists(select 1 from public.organization_members m where m.id=owner_membership_id and m.user_id=auth.uid() and m.status='active'))
);
revoke insert,update,delete on public.crm_timeline_events from authenticated,anon;
grant select on public.crm_timeline_events to authenticated;
grant all on public.crm_timeline_events to service_role;
revoke all on function public.write_crm_timeline_event(uuid,uuid,uuid,uuid,text,text,text,uuid,text,text,text,timestamptz,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.write_crm_timeline_event(uuid,uuid,uuid,uuid,text,text,text,uuid,text,text,text,timestamptz,uuid,uuid,text,jsonb,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
