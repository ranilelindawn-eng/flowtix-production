begin;

create table if not exists public.saved_dashboards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  kind text not null default 'custom' check (kind in ('executive','sales','agent','campaign','ai','operations','telephony','custom')),
  is_default boolean not null default false,
  is_system boolean not null default false,
  allowed_roles jsonb not null default '["owner","admin","manager","agent"]'::jsonb check (jsonb_typeof(allowed_roles)='array'),
  layout jsonb not null default '[]'::jsonb check (jsonb_typeof(layout)='array'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create unique index if not exists saved_dashboards_one_default_idx on public.saved_dashboards(organization_id) where is_default;
create index if not exists saved_dashboards_org_kind_idx on public.saved_dashboards(organization_id,kind,name);

create or replace function public.seed_flowtix_dashboards(target_organization_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.saved_dashboards(organization_id,name,slug,description,kind,is_default,is_system,allowed_roles,layout,created_by)
  values
  (target_organization_id,'Executive Dashboard','executive','Organization-wide revenue, pipeline, campaign, AI, and operational health.','executive',true,true,'["owner","admin"]',
   '[{"id":"pipeline","type":"kpi","title":"Pipeline value","metric":"sales.pipeline_value","format":"currency","href":"/dashboard/sales-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"revenue","type":"kpi","title":"Won revenue","metric":"sales.won_revenue","format":"currency","href":"/dashboard/sales-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"campaign-roi","type":"kpi","title":"Campaign ROI","metric":"campaigns.roi","format":"percent","href":"/dashboard/campaign-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"ai-success","type":"kpi","title":"AI success rate","metric":"ai.success_rate","format":"percent","href":"/dashboard/ai-analytics","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,actor_id),
  (target_organization_id,'Sales Dashboard','sales','Pipeline performance, won revenue, opportunities, and win rate.','sales',false,true,'["owner","admin","manager","agent"]',
   '[{"id":"pipeline","type":"kpi","title":"Pipeline value","metric":"sales.pipeline_value","format":"currency","href":"/dashboard/sales-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"won","type":"kpi","title":"Won revenue","metric":"sales.won_revenue","format":"currency","href":"/dashboard/sales-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"win-rate","type":"kpi","title":"Win rate","metric":"sales.win_rate","format":"percent","href":"/dashboard/sales-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"open","type":"kpi","title":"Open opportunities","metric":"sales.open_opportunities","format":"number","href":"/dashboard/pipelines","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,actor_id),
  (target_organization_id,'Agent Dashboard','agent','Agent availability, call activity, productivity, and connect performance.','agent',false,true,'["owner","admin","manager","agent"]',
   '[{"id":"active","type":"kpi","title":"Available agents","metric":"agents.active","format":"number","href":"/dashboard/agent-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"calls","type":"kpi","title":"Agent calls","metric":"agents.calls","format":"number","href":"/dashboard/agent-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"productivity","type":"kpi","title":"Productivity score","metric":"agents.utilization","format":"percent","href":"/dashboard/agent-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"connect","type":"kpi","title":"Connect rate","metric":"agents.conversion_rate","format":"percent","href":"/dashboard/agent-analytics","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,actor_id),
  (target_organization_id,'Campaign Dashboard','campaign','Campaign volume, enrollment, conversion, and ROI.','campaign',false,true,'["owner","admin","manager"]',
   '[{"id":"active","type":"kpi","title":"Active campaigns","metric":"campaigns.active","format":"number","href":"/dashboard/campaign-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"enrollments","type":"kpi","title":"Enrollments","metric":"campaigns.enrollments","format":"number","href":"/dashboard/campaign-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"conversion","type":"kpi","title":"Conversion rate","metric":"campaigns.conversion_rate","format":"percent","href":"/dashboard/campaign-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"roi","type":"kpi","title":"Campaign ROI","metric":"campaigns.roi","format":"percent","href":"/dashboard/campaign-analytics","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,actor_id),
  (target_organization_id,'AI Dashboard','ai','AI usage, reliability, token volume, and cost.','ai',false,true,'["owner","admin","manager"]',
   '[{"id":"requests","type":"kpi","title":"AI requests","metric":"ai.requests","format":"number","href":"/dashboard/ai-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"success","type":"kpi","title":"Success rate","metric":"ai.success_rate","format":"percent","href":"/dashboard/ai-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"tokens","type":"kpi","title":"Total tokens","metric":"ai.tokens","format":"number","href":"/dashboard/ai-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"cost","type":"kpi","title":"AI cost micros","metric":"ai.cost_micros","format":"number","href":"/dashboard/ai-analytics","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,actor_id),
  (target_organization_id,'Operations Dashboard','operations','Background processing and analytics snapshot health.','operations',false,true,'["owner","admin","manager"]',
   '[{"id":"jobs","type":"status","title":"Pending jobs","metric":"operations.pending_jobs","format":"number","href":"/dashboard/settings/jobs","position":{"x":0,"y":0,"w":6,"h":1}},{"id":"snapshots","type":"status","title":"Analytics feeds online","metric":"operations.snapshot_count","format":"number","href":"/dashboard/reports","position":{"x":6,"y":0,"w":6,"h":1}}]'::jsonb,actor_id),
  (target_organization_id,'Telephony Dashboard','telephony','Call volume, connect rate, failures, and average duration.','telephony',false,true,'["owner","admin","manager","agent"]',
   '[{"id":"calls","type":"kpi","title":"Total calls","metric":"telephony.calls","format":"number","href":"/dashboard/call-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"answer","type":"kpi","title":"Connect rate","metric":"telephony.answer_rate","format":"percent","href":"/dashboard/call-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"failed","type":"kpi","title":"Failed calls","metric":"telephony.failed","format":"number","href":"/dashboard/call-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"duration","type":"kpi","title":"Average duration","metric":"telephony.duration","format":"duration","href":"/dashboard/call-analytics","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,actor_id)
  on conflict (organization_id,slug) do nothing;
end; $$;

insert into public.saved_dashboards(organization_id,name,slug,description,kind,is_default,is_system,allowed_roles,layout,created_by)
select o.id,'Executive Dashboard','executive','Organization-wide revenue, pipeline, campaign, AI, and operational health.','executive',true,true,'["owner","admin"]'::jsonb,
'[{"id":"pipeline","type":"kpi","title":"Pipeline value","metric":"sales.pipeline_value","format":"currency","href":"/dashboard/sales-analytics","position":{"x":0,"y":0,"w":3,"h":1}},{"id":"revenue","type":"kpi","title":"Won revenue","metric":"sales.won_revenue","format":"currency","href":"/dashboard/sales-analytics","position":{"x":3,"y":0,"w":3,"h":1}},{"id":"campaign-roi","type":"kpi","title":"Campaign ROI","metric":"campaigns.roi","format":"percent","href":"/dashboard/campaign-analytics","position":{"x":6,"y":0,"w":3,"h":1}},{"id":"ai-success","type":"kpi","title":"AI success rate","metric":"ai.success_rate","format":"percent","href":"/dashboard/ai-analytics","position":{"x":9,"y":0,"w":3,"h":1}}]'::jsonb,
coalesce((select om.user_id from public.organization_members om where om.organization_id=o.id and om.role='owner' order by om.created_at limit 1),(select om.user_id from public.organization_members om where om.organization_id=o.id order by om.created_at limit 1))
from public.organizations o
where exists(select 1 from public.organization_members om where om.organization_id=o.id)
on conflict (organization_id,slug) do nothing;

do $$ declare r record; begin for r in select o.id organization_id, coalesce((select om.user_id from public.organization_members om where om.organization_id=o.id and om.role='owner' order by om.created_at limit 1),(select om.user_id from public.organization_members om where om.organization_id=o.id order by om.created_at limit 1)) actor_id from public.organizations o loop if r.actor_id is not null then perform public.seed_flowtix_dashboards(r.organization_id,r.actor_id); end if; end loop; end $$;


create or replace function public.seed_flowtix_dashboards_after_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.seed_flowtix_dashboards(new.organization_id,new.user_id);
  return new;
end; $$;
drop trigger if exists organization_members_seed_dashboards on public.organization_members;
create trigger organization_members_seed_dashboards after insert on public.organization_members for each row execute function public.seed_flowtix_dashboards_after_membership();

alter table public.saved_dashboards enable row level security;
create policy saved_dashboards_select_member on public.saved_dashboards for select to authenticated using (public.is_organization_member(organization_id) and allowed_roles ? coalesce((select om.role::text from public.organization_members om where om.organization_id=saved_dashboards.organization_id and om.user_id=auth.uid() limit 1),''));
create policy saved_dashboards_insert_member on public.saved_dashboards for insert to authenticated with check (created_by=auth.uid() and public.is_organization_member(organization_id));
create policy saved_dashboards_update_member on public.saved_dashboards for update to authenticated using (not is_system and public.is_organization_member(organization_id)) with check (not is_system and public.is_organization_member(organization_id));
create policy saved_dashboards_delete_member on public.saved_dashboards for delete to authenticated using (not is_system and public.is_organization_member(organization_id));
revoke all on public.saved_dashboards from anon;
grant select,insert,update,delete on public.saved_dashboards to authenticated;

commit;
