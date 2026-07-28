begin;

update public.subscription_plans
set
  name = 'Enterprise',
  description = coalesce(
    nullif(description, ''),
    'For high-volume organizations that need unlimited scale, advanced controls, and priority support.'
  ),
  monthly_price_cents = 49900,
  max_members = null,
  max_contacts = null,
  is_public = true,
  is_active = true,
  sort_order = 40,
  features = case
    when jsonb_typeof(features) = 'array' and jsonb_array_length(features) > 0 then features
    else '[
      "Everything in Business",
      "Unlimited team members including the owner",
      "Unlimited contacts",
      "Unlimited private storage",
      "Unlimited monthly calls",
      "Enterprise roles and controls",
      "Priority onboarding and support"
    ]'::jsonb
  end,
  updated_at = now()
where code = 'enterprise';

commit;

select
  code,
  name,
  monthly_price_cents,
  stripe_price_id,
  is_public,
  is_active,
  sort_order
from public.subscription_plans
where code = 'enterprise';
