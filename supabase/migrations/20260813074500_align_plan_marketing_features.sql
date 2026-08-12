begin;

-- Flowtix plan-display alignment
--
-- Keeps the Billing plan cards and public Pricing page consistent with the
-- actual feature entitlements. This migration changes only plan-facing
-- marketing labels/descriptions plus the already-approved automation.advanced
-- entitlement restriction.

update public.subscription_plans
set
  name = case code
    when 'starter' then 'Starter'
    when 'pro' then 'Professional'
    when 'business' then 'Business'
    when 'enterprise' then 'Enterprise'
    else name
  end,
  description = case code
    when 'starter' then
      'For freelancers, virtual assistants, and small teams that need the essential Flowtix CRM workspace.'
    when 'pro' then
      'For active sales teams that need cloud calling, AI, sequences, advanced reporting, and premium integrations.'
    when 'business' then
      'For larger teams that need advanced automation, exports, permissions, security controls, and API access.'
    when 'enterprise' then
      'For high-volume organizations that need unlimited scale, advanced automation, enterprise controls, and priority support.'
    else description
  end,
  features = case code
    when 'starter' then '[
      "Up to 5 team members including the owner",
      "1,000 contacts",
      "Core CRM workspace",
      "Contacts, companies, pipelines, tasks, notes, and calendar",
      "Manual Email & SMS",
      "Basic campaigns",
      "Basic reporting",
      "Google integration"
    ]'::jsonb
    when 'pro' then '[
      "Everything in Starter",
      "Up to 10 team members including the owner",
      "10,000 contacts",
      "Cloud dialer",
      "Call recordings and transcripts",
      "AI Workspace and chat",
      "AI summaries and call analysis",
      "AI email and task assistance",
      "Sequence automation",
      "Advanced reporting and analytics",
      "Premium integrations"
    ]'::jsonb
    when 'business' then '[
      "Everything in Professional",
      "Up to 30 team members including the owner",
      "Advanced automation controls",
      "Post-call email and SMS automation",
      "Campaign automation",
      "Data exports",
      "Advanced roles and permissions",
      "Advanced security controls",
      "API access",
      "Premium integrations",
      "Priority onboarding and support"
    ]'::jsonb
    when 'enterprise' then '[
      "Everything in Business",
      "Unlimited team members",
      "Unlimited contacts",
      "Unlimited storage",
      "Unlimited calls",
      "Advanced automation controls",
      "Enterprise roles and security controls",
      "API access",
      "Priority onboarding and support",
      "Premium integrations"
    ]'::jsonb
    else features
  end,
  entitlements = case
    when code in ('business', 'enterprise') then
      case
        when entitlements ? 'automation.advanced'
          then entitlements
        else entitlements || '["automation.advanced"]'::jsonb
      end
    when code in ('starter', 'pro') then
      entitlements - 'automation.advanced'
    else entitlements
  end,
  updated_at = now()
where code in ('starter', 'pro', 'business', 'enterprise');

commit;

notify pgrst, 'reload schema';
