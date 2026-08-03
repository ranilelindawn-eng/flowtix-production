ALTER TABLE public.organization_subscriptions
ADD COLUMN IF NOT EXISTS paymongo_checkout_id text;

ALTER TABLE public.organization_subscriptions
ADD COLUMN IF NOT EXISTS paymongo_payment_id text;

ALTER TABLE public.organization_subscriptions
ADD COLUMN IF NOT EXISTS payment_method text;