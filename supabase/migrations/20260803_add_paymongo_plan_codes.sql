ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS paymongo_price_code text;


UPDATE public.subscription_plans
SET paymongo_price_code = code
WHERE paymongo_price_code IS NULL;