begin;

create table if not exists public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  category text not null default 'general',
  value_format text not null default 'number',
  direction text not null default 'neutral',
  target_value numeric,
  is_active boolean not null default true,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_definitions_key_format check (key ~ '^[a-z0-9][a-z0-9_]{1,79}$'),
  constraint kpi_definitions_value_format check (value_format in ('number','currency','percentage','duration')),
  constraint kpi_definitions_direction check (direction in ('higher_is_better','lower_is_better','neutral')),
  constraint kpi_definitions_position check (position >= 0),
  unique (organization_id, key)
);

create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  previous_snapshot_id uuid references public.kpi_snapshots(id) on delete set null,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint kpi_snapshots_period check (period in ('7d','30d','90d','365d')),
  constraint kpi_snapshots_range check (period_end >= period_start)
);

create table if not exists public.kpi_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid not null references public.kpi_snapshots(id) on delete cascade,
  definition_id uuid not null references public.kpi_definitions(id) on delete cascade,
  value numeric not null,
  previous_value numeric,
  change_percent numeric,
  measured_at timestamptz not null default now(),
  dimensions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (snapshot_id, definition_id)
);

create index if not exists kpi_definitions_org_active_idx
  on public.kpi_definitions (organization_id, is_active, position);
create index if not exists kpi_snapshots_org_period_captured_idx
  on public.kpi_snapshots (organization_id, period, captured_at desc);
create index if not exists kpi_values_snapshot_idx
  on public.kpi_values (snapshot_id, definition_id);
create index if not exists kpi_values_org_measured_idx
  on public.kpi_values (organization_id, measured_at desc);

create or replace function public.validate_kpi_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_org uuid;
  definition_org uuid;
begin
  select organization_id into snapshot_org from public.kpi_snapshots where id = new.snapshot_id;
  select organization_id into definition_org from public.kpi_definitions where id = new.definition_id;
  if snapshot_org is null or definition_org is null then
    raise exception 'KPI snapshot and definition are required.';
  end if;
  if new.organization_id <> snapshot_org or new.organization_id <> definition_org then
    raise exception 'KPI relationships must belong to the same organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_kpi_values_relationships on public.kpi_values;
create trigger validate_kpi_values_relationships
before insert or update on public.kpi_values
for each row execute function public.validate_kpi_relationships();

alter table public.kpi_definitions enable row level security;
alter table public.kpi_snapshots enable row level security;
alter table public.kpi_values enable row level security;

revoke all on public.kpi_definitions from anon;
revoke all on public.kpi_snapshots from anon;
revoke all on public.kpi_values from anon;

grant select, insert, update on public.kpi_definitions to authenticated;
grant select, insert on public.kpi_snapshots to authenticated;
grant select, insert on public.kpi_values to authenticated;

drop policy if exists kpi_definitions_select on public.kpi_definitions;
create policy kpi_definitions_select on public.kpi_definitions
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists kpi_definitions_insert on public.kpi_definitions;
create policy kpi_definitions_insert on public.kpi_definitions
for insert to authenticated with check (public.is_organization_member(organization_id));

drop policy if exists kpi_definitions_update on public.kpi_definitions;
create policy kpi_definitions_update on public.kpi_definitions
for update to authenticated using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists kpi_snapshots_select on public.kpi_snapshots;
create policy kpi_snapshots_select on public.kpi_snapshots
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists kpi_snapshots_insert on public.kpi_snapshots;
create policy kpi_snapshots_insert on public.kpi_snapshots
for insert to authenticated with check (
  public.is_organization_member(organization_id)
  and (captured_by is null or captured_by = auth.uid())
);

drop policy if exists kpi_values_select on public.kpi_values;
create policy kpi_values_select on public.kpi_values
for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists kpi_values_insert on public.kpi_values;
create policy kpi_values_insert on public.kpi_values
for insert to authenticated with check (public.is_organization_member(organization_id));

commit;
