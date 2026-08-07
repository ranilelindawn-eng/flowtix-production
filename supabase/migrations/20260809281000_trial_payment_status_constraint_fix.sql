begin;

-- Flowtix 7-day trial compatibility fix.
--
-- The existing PayMongo lifecycle constraint predates the free-trial states.
-- Preserve every existing allowed value and add only:
--   trialing
--   trial_expired

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_last_payment_status_check;

alter table public.organization_subscriptions
  add constraint organization_subscriptions_last_payment_status_check
  check (
    last_payment_status is null
    or last_payment_status in (
      'pending',
      'paid',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled',
      'expired',
      'trialing',
      'trial_expired'
    )
  );

notify pgrst, 'reload schema';

commit;
