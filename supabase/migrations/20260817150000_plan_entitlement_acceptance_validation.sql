begin;

-- -------------------------------------------------------------------
-- Flowtix final plan acceptance validation.
--
-- Read-only Platform diagnostics for the canonical four-plan model and the
-- live subscription state machine. This function never changes plans,
-- subscriptions, payments, entitlements, usage, or customer data.
-- -------------------------------------------------------------------

create or replace function public.platform_plan_acceptance_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_plans jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '{}'::jsonb;
  v_lifecycle jsonb := '{}'::jsonb;
  v_unexpected_public_plans bigint := 0;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', plan.id,
        'code', plan.code,
        'name', plan.name,
        'billingProvider', plan.billing_provider,
        'monthlyPriceCents', plan.monthly_price_cents,
        'publicPriceUsdCents', plan.public_price_usd_cents,
        'sortOrder', plan.sort_order,
        'isPublic', plan.is_public,
        'isActive', plan.is_active,
        'maxMembers', plan.max_members,
        'maxContacts', plan.max_contacts,
        'maxStorageBytes', plan.max_storage_bytes,
        'maxAiRequestsPerMonth', plan.max_ai_requests_per_month,
        'maxActiveCampaigns', plan.max_active_campaigns,
        'maxActiveSequences', plan.max_active_sequences,
        'recordingRetentionDays', plan.recording_retention_days,
        'maxTranscriptionMinutesPerMonth', plan.max_transcription_minutes_per_month,
        'entitlements', coalesce(plan.entitlements, '[]'::jsonb)
      )
      order by plan.sort_order, plan.code
    ),
    '[]'::jsonb
  )
  into v_plans
  from public.subscription_plans plan
  where plan.code in ('starter', 'pro', 'business', 'enterprise');

  select count(*)
  into v_unexpected_public_plans
  from public.subscription_plans plan
  where plan.is_active = true
    and coalesce(plan.is_public, true) = true
    and plan.billing_provider = 'paymongo'
    and plan.code not in ('starter', 'pro', 'business', 'enterprise');

  select jsonb_build_object(
    'total', count(*),
    'nonPayMongo', count(*) filter (
      where coalesce(subscription.billing_provider, 'paymongo') <> 'paymongo'
    ),
    'invalidCurrentPlan', count(*) filter (
      where current_plan.id is null
         or current_plan.code not in ('starter', 'pro', 'business', 'enterprise')
    ),
    'orphanPendingPlan', count(*) filter (
      where subscription.pending_plan_id is not null
        and pending_plan.id is null
    ),
    'orphanScheduledPlan', count(*) filter (
      where subscription.scheduled_plan_id is not null
        and scheduled_plan.id is null
    ),
    'expiredTrialing', count(*) filter (
      where subscription.status = 'trialing'
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at <= pg_catalog.now()
    ),
    'invalidTrialBillingState', count(*) filter (
      where subscription.status = 'trialing'
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at > pg_catalog.now()
        and (
          subscription.pending_plan_id is not null
          or subscription.paymongo_checkout_id is not null
          or subscription.provider_checkout_id is not null
          or subscription.last_payment_status is distinct from 'trialing'
        )
    ),
    'invalidScheduledDowngrade', count(*) filter (
      where subscription.scheduled_plan_id is not null
        and (
          scheduled_plan.id is null
          or subscription.status <> 'active'
          or subscription.cancel_at_period_end = true
          or subscription.current_period_end is null
          or subscription.scheduled_plan_effective_at is distinct from subscription.current_period_end
          or scheduled_plan.sort_order >= current_plan.sort_order
        )
    ),
    'invalidActiveUpgradeTarget', count(*) filter (
      where subscription.status = 'active'
        and subscription.current_period_end is not null
        and subscription.current_period_end > pg_catalog.now()
        and subscription.pending_plan_id is not null
        and (
          pending_plan.id is null
          or pending_plan.sort_order <= current_plan.sort_order
        )
    ),
    'pendingWithoutCheckoutOrLease', count(*) filter (
      where subscription.pending_plan_id is not null
        and not (
          subscription.paymongo_checkout_id is not null
          and subscription.pending_checkout_expires_at is not null
          and subscription.pending_checkout_expires_at > pg_catalog.now()
        )
        and not (
          subscription.checkout_creation_token is not null
          and subscription.checkout_creation_started_at is not null
          and subscription.checkout_creation_started_at > pg_catalog.now() - interval '15 minutes'
        )
    ),
    'expiredPendingCheckout', count(*) filter (
      where subscription.paymongo_checkout_id is not null
        and subscription.pending_checkout_expires_at is not null
        and subscription.pending_checkout_expires_at <= pg_catalog.now()
        and subscription.last_payment_status = 'pending'
    ),
    'cancelledWithPendingState', count(*) filter (
      where subscription.status = 'cancelled'
        and (
          subscription.pending_plan_id is not null
          or subscription.scheduled_plan_id is not null
          or subscription.paymongo_checkout_id is not null
          or subscription.provider_checkout_id is not null
          or subscription.checkout_creation_token is not null
        )
    ),
    'activeEnterprise', count(*) filter (
      where current_plan.code = 'enterprise'
        and subscription.status in ('active', 'trialing', 'past_due')
    )
  )
  into v_subscriptions
  from public.organization_subscriptions subscription
  left join public.subscription_plans current_plan
    on current_plan.id = subscription.plan_id
  left join public.subscription_plans pending_plan
    on pending_plan.id = subscription.pending_plan_id
  left join public.subscription_plans scheduled_plan
    on scheduled_plan.id = subscription.scheduled_plan_id;

  select jsonb_build_object(
    'trialPlanChanges', count(*) filter (
      where event.event_type = 'trial_plan_changed'
    ),
    'planChangesScheduled', count(*) filter (
      where event.event_type = 'plan_change_scheduled'
    ),
    'planChangesCancelled', count(*) filter (
      where event.event_type = 'plan_change_cancelled'
    ),
    'planChangesApplied', count(*) filter (
      where event.event_type = 'plan_change_applied'
    ),
    'paidEvents', count(*) filter (
      where event.event_type = 'payment_paid'
    ),
    'failedPaymentEvents', count(*) filter (
      where event.event_type = 'payment_failed'
    ),
    'cancellationsScheduled', count(*) filter (
      where event.event_type = 'cancellation_scheduled'
    ),
    'cancellationsRevoked', count(*) filter (
      where event.event_type = 'cancellation_revoked'
    )
  )
  into v_lifecycle
  from public.subscription_lifecycle_events event;

  return jsonb_build_object(
    'checkedAt', pg_catalog.now(),
    'plans', v_plans,
    'unexpectedPublicPlans', v_unexpected_public_plans,
    'subscriptions', v_subscriptions,
    'lifecycle', v_lifecycle
  );
end;
$function$;

revoke all on function public.platform_plan_acceptance_report()
from public, anon;

grant execute on function public.platform_plan_acceptance_report()
to authenticated;

comment on function public.platform_plan_acceptance_report() is
  'Read-only Platform acceptance snapshot for canonical Flowtix plans, subscription plan-change state, and lifecycle diagnostics.';

notify pgrst, 'reload schema';

commit;
