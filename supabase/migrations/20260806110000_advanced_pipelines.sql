-- Flowtix Phase 5.4: advanced pipelines

alter table public.pipelines
  add column if not exists pipeline_type text not null default 'sales',
  add column if not exists status text not null default 'active',
  add column if not exists currency_code text not null default 'USD',
  add column if not exists default_probability_mode text not null default 'stage',
  add column if not exists stage_aging_enabled boolean not null default true,
  add column if not exists stale_after_days integer,
  add column if not exists won_stage_id uuid,
  add column if not exists lost_stage_id uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.pipeline_stages
  add column if not exists stage_type text not null default 'open',
  add column if not exists color text not null default '#2563eb',
  add column if not exists description text,
  add column if not exists target_days integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_locked boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.pipelines drop constraint if exists pipelines_pipeline_type_check;
alter table public.pipelines add constraint pipelines_pipeline_type_check
  check (pipeline_type in ('sales','renewal','expansion','partner','custom'));
alter table public.pipelines drop constraint if exists pipelines_status_check;
alter table public.pipelines add constraint pipelines_status_check
  check (status in ('active','inactive','archived'));
alter table public.pipelines drop constraint if exists pipelines_probability_mode_check;
alter table public.pipelines add constraint pipelines_probability_mode_check
  check (default_probability_mode in ('stage','manual'));
alter table public.pipelines drop constraint if exists pipelines_currency_code_check;
alter table public.pipelines add constraint pipelines_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');
alter table public.pipelines drop constraint if exists pipelines_stale_after_days_check;
alter table public.pipelines add constraint pipelines_stale_after_days_check
  check (stale_after_days is null or stale_after_days between 1 and 3650);

alter table public.pipeline_stages drop constraint if exists pipeline_stages_stage_type_check;
alter table public.pipeline_stages add constraint pipeline_stages_stage_type_check
  check (stage_type in ('open','won','lost'));
alter table public.pipeline_stages drop constraint if exists pipeline_stages_target_days_check;
alter table public.pipeline_stages add constraint pipeline_stages_target_days_check
  check (target_days is null or target_days between 1 and 3650);

create index if not exists pipelines_org_status_idx on public.pipelines(organization_id,status,created_at desc);
create index if not exists pipelines_org_type_idx on public.pipelines(organization_id,pipeline_type);
create index if not exists pipeline_stages_pipeline_active_position_idx on public.pipeline_stages(pipeline_id,is_active,position);
create unique index if not exists pipeline_stages_one_won_idx on public.pipeline_stages(pipeline_id) where stage_type='won' and is_active;
create unique index if not exists pipeline_stages_one_lost_idx on public.pipeline_stages(pipeline_id) where stage_type='lost' and is_active;

create table if not exists public.pipeline_change_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  action text not null check (action in ('created','updated','archived','restored','stage_created','stage_updated','stage_reordered','stage_archived')),
  before_state jsonb,
  after_state jsonb,
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists pipeline_change_history_pipeline_idx on public.pipeline_change_history(organization_id,pipeline_id,created_at desc);
alter table public.pipeline_change_history enable row level security;

drop policy if exists pipeline_change_history_select on public.pipeline_change_history;
create policy pipeline_change_history_select on public.pipeline_change_history for select to authenticated
using (exists (select 1 from public.organization_members om where om.organization_id=pipeline_change_history.organization_id and om.user_id=auth.uid() and om.status='active'));
revoke insert, update, delete on public.pipeline_change_history from authenticated, anon;

create or replace function public.validate_pipeline_stage_configuration()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_org uuid;
begin
  select organization_id into p_org from public.pipelines where id=new.pipeline_id;
  if p_org is null or p_org <> new.organization_id then raise exception 'PIPELINE_STAGE_ORGANIZATION_MISMATCH'; end if;
  if new.stage_type='won' then new.probability := 100; end if;
  if new.stage_type='lost' then new.probability := 0; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists validate_pipeline_stage_configuration_trigger on public.pipeline_stages;
create trigger validate_pipeline_stage_configuration_trigger before insert or update on public.pipeline_stages
for each row execute function public.validate_pipeline_stage_configuration();

create or replace function public.sync_pipeline_terminal_stages()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.pipelines set
    won_stage_id=(select id from public.pipeline_stages where pipeline_id=coalesce(new.pipeline_id,old.pipeline_id) and stage_type='won' and is_active limit 1),
    lost_stage_id=(select id from public.pipeline_stages where pipeline_id=coalesce(new.pipeline_id,old.pipeline_id) and stage_type='lost' and is_active limit 1),
    updated_at=now()
  where id=coalesce(new.pipeline_id,old.pipeline_id);
  return null;
end $$;

drop trigger if exists sync_pipeline_terminal_stages_trigger on public.pipeline_stages;
create trigger sync_pipeline_terminal_stages_trigger after insert or update or delete on public.pipeline_stages
for each row execute function public.sync_pipeline_terminal_stages();

update public.pipeline_stages set stage_type='won', probability=100 where lower(name)='won';
update public.pipeline_stages set stage_type='lost', probability=0 where lower(name)='lost';

create or replace function public.find_pipeline_duplicates(p_name text, p_exclude_id uuid default null)
returns table(id uuid,name text,status text,pipeline_type text) language sql stable security definer set search_path=public as $$
  select p.id,p.name,p.status,p.pipeline_type
  from public.pipelines p
  where p.organization_id in (select organization_id from public.organization_members where user_id=auth.uid() and status='active')
    and p.id is distinct from p_exclude_id
    and lower(trim(p.name))=lower(trim(coalesce(p_name,'')))
  order by p.created_at desc limit 25
$$;
grant execute on function public.find_pipeline_duplicates(text,uuid) to authenticated;
