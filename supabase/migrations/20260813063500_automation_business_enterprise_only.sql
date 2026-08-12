begin;

-- Flowtix advanced automation plan restriction
--
-- Scope:
--   Automation Settings / Monitoring and Controls
--   Post-call email/SMS automation
--   Automation pause/retry/recovery operations
--
-- Business and Enterprise only.
--
-- Existing Sequence/Campaign feature entitlements are intentionally left
-- unchanged so this migration does not alter other already-working modules.

update public.subscription_plans
set
  entitlements = case
    when code in ('business', 'enterprise') then
      case
        when entitlements ? 'automation.advanced'
          then entitlements
        else entitlements || '["automation.advanced"]'::jsonb
      end
    else entitlements - 'automation.advanced'
  end,
  updated_at = now()
where code in ('starter', 'pro', 'business', 'enterprise');

-- Prevent a previously-enabled Starter/Pro post-call configuration from
-- continuing to enqueue automation after the plan restriction is applied.
-- Organizations without an explicit subscription resolve to Starter behavior.
update public.post_call_automation_configs as config
set
  enabled = false,
  updated_at = now()
where config.enabled = true
  and not exists (
    select 1
    from public.organization_subscriptions as subscription
    join public.subscription_plans as plan
      on plan.id = subscription.plan_id
    where subscription.organization_id = config.organization_id
      and plan.code in ('business', 'enterprise')
  );

commit;

notify pgrst, 'reload schema';
