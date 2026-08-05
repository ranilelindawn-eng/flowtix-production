-- Flowtix Phase 5.3: Advanced opportunities

alter table public.opportunities
  add column if not exists opportunity_type text not null default 'new_business',
  add column if not exists source text,
  add column if not exists forecast_category text not null default 'pipeline',
  add column if not exists amount_type text not null default 'one_time',
  add column if not exists recurring_amount numeric(14,2),
  add column if not exists recurring_interval text,
  add column if not exists next_step text,
  add column if not exists next_step_due_at timestamptz,
  add column if not exists loss_reason text,
  add column if not exists competitor_names text[] not null default '{}'::text[],
  add column if not exists stage_entered_at timestamptz not null default now(),
  add column if not exists last_activity_at timestamptz,
  add column if not exists actual_close_date date,
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

update public.opportunities set
  won_at = case when status='won' then coalesce(won_at,updated_at,created_at,now()) else null end,
  lost_at = case when status='lost' then coalesce(lost_at,updated_at,created_at,now()) else null end,
  closed_at = case when status in ('won','lost') then coalesce(closed_at,updated_at,created_at,now()) else null end,
  actual_close_date = case when status in ('won','lost') then coalesce(actual_close_date,coalesce(updated_at,created_at,now())::date) else null end,
  forecast_category = case when status='won' then 'closed' when status='lost' then 'omitted' else forecast_category end;

do $$ begin
  alter table public.opportunities add constraint opportunities_type_check
    check (opportunity_type in ('new_business','renewal','upsell','cross_sell','expansion','other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.opportunities add constraint opportunities_forecast_category_check
    check (forecast_category in ('pipeline','best_case','commit','closed','omitted'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.opportunities add constraint opportunities_amount_type_check
    check (amount_type in ('one_time','recurring','mixed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.opportunities add constraint opportunities_recurring_interval_check
    check (recurring_interval is null or recurring_interval in ('monthly','quarterly','annual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.opportunities add constraint opportunities_recurring_amount_check
    check (recurring_amount is null or recurring_amount >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.opportunities add constraint opportunities_closed_fields_check check (
    (status = 'open' and closed_at is null and won_at is null and lost_at is null)
    or (status = 'won' and won_at is not null and closed_at is not null and lost_at is null)
    or (status = 'lost' and lost_at is not null and closed_at is not null and won_at is null)
  );
exception when duplicate_object then null; end $$;

create table if not exists public.opportunity_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','boolean','select','multi_select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, field_key)
);

create table if not exists public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists opportunities_org_forecast_idx on public.opportunities(organization_id, forecast_category, expected_close_date);
create index if not exists opportunities_org_type_idx on public.opportunities(organization_id, opportunity_type, updated_at desc);
create index if not exists opportunities_org_next_step_idx on public.opportunities(organization_id, next_step_due_at) where status = 'open';
create index if not exists opportunities_org_close_idx on public.opportunities(organization_id, actual_close_date, status);
create index if not exists opportunity_stage_history_lookup_idx on public.opportunity_stage_history(organization_id, opportunity_id, changed_at desc);

create or replace function public.prepare_opportunity_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at,now());
  elsif new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
  end if;
  if new.status = 'won' and (tg_op='INSERT' or old.status is distinct from 'won') then
    new.won_at := coalesce(new.won_at,now()); new.lost_at := null; new.closed_at := coalesce(new.closed_at,now()); new.actual_close_date := coalesce(new.actual_close_date,current_date); new.forecast_category := 'closed';
  elsif new.status = 'lost' and (tg_op='INSERT' or old.status is distinct from 'lost') then
    new.lost_at := coalesce(new.lost_at,now()); new.won_at := null; new.closed_at := coalesce(new.closed_at,now()); new.actual_close_date := coalesce(new.actual_close_date,current_date); new.forecast_category := 'omitted';
  elsif new.status = 'open' then
    new.won_at := null; new.lost_at := null; new.closed_at := null; new.actual_close_date := null;
  end if;
  return new;
end $$;

create or replace function public.record_opportunity_stage_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.opportunity_stage_history(organization_id,opportunity_id,pipeline_id,to_stage_id,to_status,changed_by,metadata)
    values(new.organization_id,new.id,new.pipeline_id,new.stage_id,new.status,auth.uid(),jsonb_build_object('event','created'));
  elsif new.stage_id is distinct from old.stage_id or new.status is distinct from old.status then
    insert into public.opportunity_stage_history(organization_id,opportunity_id,pipeline_id,from_stage_id,to_stage_id,from_status,to_status,changed_by)
    values(new.organization_id,new.id,new.pipeline_id,old.stage_id,new.stage_id,old.status,new.status,auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists opportunities_lifecycle_trigger on public.opportunities;
create trigger opportunities_lifecycle_trigger before insert or update of stage_id,status on public.opportunities
for each row execute function public.prepare_opportunity_lifecycle();
drop trigger if exists opportunities_stage_history_trigger on public.opportunities;
create trigger opportunities_stage_history_trigger after insert or update of stage_id,status on public.opportunities
for each row execute function public.record_opportunity_stage_history();

create or replace function public.find_opportunity_duplicates(
  p_organization_id uuid,
  p_opportunity_id uuid default null,
  p_name text default null,
  p_company_id uuid default null,
  p_contact_id uuid default null
) returns table(opportunity_id uuid,name text,company_id uuid,contact_id uuid,status text,match_reasons text[])
language sql stable security definer set search_path=public as $$
  select o.id,o.name,o.company_id,o.contact_id,o.status,
    array_remove(array[
      case when nullif(regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g'),'') is not null
        and regexp_replace(lower(trim(o.name)),'[^a-z0-9]+','','g') = regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','','g') then 'name' end,
      case when p_company_id is not null and o.company_id = p_company_id then 'company' end,
      case when p_contact_id is not null and o.contact_id = p_contact_id then 'contact' end
    ],null)::text[]
  from public.opportunities o
  where o.organization_id=p_organization_id
    and (p_opportunity_id is null or o.id<>p_opportunity_id)
    and public.is_organization_member(p_organization_id)
    and (
      (nullif(trim(coalesce(p_name,'')),'') is not null and regexp_replace(lower(trim(o.name)),'[^a-z0-9]+','','g')=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','','g'))
      or (p_company_id is not null and o.company_id=p_company_id)
      or (p_contact_id is not null and o.contact_id=p_contact_id)
    )
  order by o.updated_at desc limit 25;
$$;

grant execute on function public.find_opportunity_duplicates(uuid,uuid,text,uuid,uuid) to authenticated;

alter table public.opportunity_field_definitions enable row level security;
alter table public.opportunity_stage_history enable row level security;

drop policy if exists opportunity_field_definitions_select on public.opportunity_field_definitions;
create policy opportunity_field_definitions_select on public.opportunity_field_definitions for select to authenticated
using (public.is_organization_member(organization_id));
drop policy if exists opportunity_field_definitions_manage on public.opportunity_field_definitions;
create policy opportunity_field_definitions_manage on public.opportunity_field_definitions for all to authenticated
using (public.can_manage_organization_assignments(organization_id))
with check (public.can_manage_organization_assignments(organization_id));

drop policy if exists opportunity_stage_history_select on public.opportunity_stage_history;
create policy opportunity_stage_history_select on public.opportunity_stage_history for select to authenticated
using (public.is_organization_member(organization_id));

revoke insert,update,delete on public.opportunity_stage_history from authenticated, anon;
revoke all on public.opportunity_field_definitions from anon;
