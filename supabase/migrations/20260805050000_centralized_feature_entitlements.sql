begin;

alter table public.subscription_plans
  add column if not exists entitlements jsonb not null default '[]'::jsonb;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_entitlements_array_check;

alter table public.subscription_plans
  add constraint subscription_plans_entitlements_array_check
  check (jsonb_typeof(entitlements) = 'array');

update public.subscription_plans
set entitlements = case code
  when 'free' then '[
    "crm.core",
    "calendar.core",
    "communications.manual",
    "campaigns.basic",
    "reports.basic",
    "integrations.google"
  ]'::jsonb
  when 'starter' then '[
    "crm.core",
    "calendar.core",
    "communications.manual",
    "campaigns.basic",
    "reports.basic",
    "integrations.google"
  ]'::jsonb
  when 'pro' then '[
    "crm.core",
    "calendar.core",
    "communications.manual",
    "campaigns.basic",
    "reports.basic",
    "reports.advanced",
    "dialer.cloud",
    "ai.chat",
    "ai.call_analysis",
    "ai.email",
    "ai.tasks",
    "ai.transcription",
    "automation.sequences",
    "integrations.google",
    "integrations.premium"
  ]'::jsonb
  when 'business' then '[
    "crm.core",
    "calendar.core",
    "communications.manual",
    "campaigns.basic",
    "reports.basic",
    "reports.advanced",
    "reports.export",
    "dialer.cloud",
    "ai.chat",
    "ai.call_analysis",
    "ai.email",
    "ai.tasks",
    "ai.transcription",
    "automation.sequences",
    "automation.campaigns",
    "integrations.google",
    "integrations.premium",
    "api.access",
    "team.advanced",
    "security.advanced"
  ]'::jsonb
  when 'enterprise' then '[
    "crm.core",
    "calendar.core",
    "communications.manual",
    "campaigns.basic",
    "reports.basic",
    "reports.advanced",
    "reports.export",
    "dialer.cloud",
    "ai.chat",
    "ai.call_analysis",
    "ai.email",
    "ai.tasks",
    "ai.transcription",
    "automation.sequences",
    "automation.campaigns",
    "integrations.google",
    "integrations.premium",
    "api.access",
    "team.advanced",
    "security.advanced"
  ]'::jsonb
  else entitlements
end,
updated_at = now();

create or replace function public.organization_entitlements(
  target_org uuid
)
returns table (
  plan_code text,
  plan_name text,
  subscription_status text,
  entitlements jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from public.organization_members as member
       where member.organization_id = target_org
         and member.user_id = auth.uid()
         and member.status = 'active'
     ) then
    raise exception 'ORGANIZATION_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  return query
  select
    plan.code::text,
    plan.name::text,
    subscription.status::text,
    plan.entitlements
  from public.organization_subscriptions as subscription
  join public.subscription_plans as plan
    on plan.id = subscription.plan_id
  where subscription.organization_id = target_org
  limit 1;

  if not found then
    return query
    select
      plan.code::text,
      plan.name::text,
      'active'::text,
      plan.entitlements
    from public.subscription_plans as plan
    where plan.code = 'starter'
      and plan.is_active = true
    limit 1;
  end if;
end;
$function$;

revoke all
on function public.organization_entitlements(uuid)
from public;

grant execute
on function public.organization_entitlements(uuid)
to authenticated, service_role;

comment on column public.subscription_plans.entitlements is
  'Stable machine-readable feature keys used for server-side plan enforcement. Marketing feature labels remain in features.';

commit;
