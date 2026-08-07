-- Flowtix Platform Admin — Subscription Management
-- Staff-only subscription directory, details, metrics, and controlled lifecycle actions.
-- PayMongo remains the sole active billing provider.
-- No function in this phase fabricates payment success or directly activates an unpaid target plan.

begin;

create or replace function public.platform_subscription_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare result jsonb;
begin
  if not public.is_platform_user(null::public.platform_role[]) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'mrrCents', coalesce(sum(plan.monthly_price_cents) filter (where subscription.status in ('active','past_due')), 0),
    'arrCents', coalesce(sum(plan.monthly_price_cents) filter (where subscription.status in ('active','past_due')), 0) * 12,
    'active', count(*) filter (where subscription.status = 'active'),
    'trialing', count(*) filter (where subscription.status = 'trialing'),
    'pastDue', count(*) filter (where subscription.status = 'past_due'),
    'pending', count(*) filter (where subscription.status = 'pending'),
    'cancelling', count(*) filter (where subscription.cancel_at_period_end),
    'scheduledPlanChanges', count(*) filter (where subscription.scheduled_plan_id is not null)
  ) into result
  from public.organization_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id;

  return result;
end;
$function$;

create or replace function public.platform_subscription_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare result jsonb;
begin
  if not exists (
    select 1 from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in ('platform_owner','platform_admin','finance')
  ) then
    raise exception 'PLATFORM_SUBSCRIPTION_ACCESS_DENIED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', plan.id,
    'code', plan.code,
    'name', plan.name,
    'monthlyPriceCents', plan.monthly_price_cents,
    'billingProvider', plan.billing_provider,
    'isPublic', coalesce(plan.is_public, true),
    'isActive', plan.is_active
  ) order by plan.sort_order, plan.monthly_price_cents, plan.name), '[]'::jsonb)
  into result
  from public.subscription_plans plan
  where plan.billing_provider = 'paymongo'
    and plan.is_active = true
    and plan.code <> 'free';

  return result;
end;
$function$;

create or replace function public.platform_subscription_directory(
  p_search text default null,
  p_status text default null,
  p_plan_code text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search,'')), '');
  normalized_status text := nullif(pg_catalog.btrim(coalesce(p_status,'')), '');
  normalized_plan text := nullif(pg_catalog.btrim(coalesce(p_plan_code,'')), '');
  normalized_limit integer := least(greatest(coalesce(p_limit,25),1),100);
  normalized_offset integer := greatest(coalesce(p_offset,0),0);
  total_count bigint;
  items jsonb;
begin
  if not exists (
    select 1 from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in ('platform_owner','platform_admin','finance')
  ) then
    raise exception 'PLATFORM_SUBSCRIPTION_ACCESS_DENIED' using errcode = '42501';
  end if;

  select count(*) into total_count
  from public.organization_subscriptions subscription
  join public.organizations organization on organization.id = subscription.organization_id
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where (normalized_status is null or subscription.status = normalized_status)
    and (normalized_plan is null or plan.code = normalized_plan)
    and (
      normalized_search is null
      or organization.name ilike '%' || normalized_search || '%'
      or subscription.id::text ilike '%' || normalized_search || '%'
      or exists (
        select 1 from public.organization_members owner_member
        left join public.profiles owner_profile on owner_profile.id = owner_member.user_id
        where owner_member.organization_id = organization.id
          and owner_member.role::text = 'owner'
          and coalesce(owner_profile.email,'') ilike '%' || normalized_search || '%'
      )
    );

  select coalesce(jsonb_agg(row_data.payload order by row_data.updated_at desc), '[]'::jsonb)
  into items
  from (
    select subscription.updated_at,
      jsonb_build_object(
        'id', subscription.id,
        'organizationId', organization.id,
        'organizationName', organization.name,
        'organizationStatus', coalesce(organization.status,'active'),
        'ownerEmail', (
          select owner_profile.email
          from public.organization_members owner_member
          left join public.profiles owner_profile on owner_profile.id = owner_member.user_id
          where owner_member.organization_id = organization.id and owner_member.role::text = 'owner'
          order by owner_member.created_at asc limit 1
        ),
        'status', subscription.status,
        'planId', plan.id,
        'planCode', plan.code,
        'planName', plan.name,
        'monthlyPriceCents', plan.monthly_price_cents,
        'billingProvider', subscription.billing_provider,
        'currentPeriodStart', subscription.current_period_start,
        'currentPeriodEnd', subscription.current_period_end,
        'cancelAtPeriodEnd', subscription.cancel_at_period_end,
        'lastPaymentStatus', subscription.last_payment_status,
        'pendingPlanCode', pending_plan.code,
        'scheduledPlanCode', scheduled_plan.code,
        'scheduledPlanEffectiveAt', subscription.scheduled_plan_effective_at,
        'pendingCheckout', subscription.paymongo_checkout_id is not null or subscription.provider_checkout_id is not null or subscription.pending_plan_id is not null,
        'updatedAt', subscription.updated_at
      ) payload
    from public.organization_subscriptions subscription
    join public.organizations organization on organization.id = subscription.organization_id
    join public.subscription_plans plan on plan.id = subscription.plan_id
    left join public.subscription_plans pending_plan on pending_plan.id = subscription.pending_plan_id
    left join public.subscription_plans scheduled_plan on scheduled_plan.id = subscription.scheduled_plan_id
    where (normalized_status is null or subscription.status = normalized_status)
      and (normalized_plan is null or plan.code = normalized_plan)
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or subscription.id::text ilike '%' || normalized_search || '%'
        or exists (
          select 1 from public.organization_members owner_member
          left join public.profiles owner_profile on owner_profile.id = owner_member.user_id
          where owner_member.organization_id = organization.id
            and owner_member.role::text = 'owner'
            and coalesce(owner_profile.email,'') ilike '%' || normalized_search || '%'
        )
      )
    order by subscription.updated_at desc
    limit normalized_limit offset normalized_offset
  ) row_data;

  return jsonb_build_object('items',items,'total',total_count,'limit',normalized_limit,'offset',normalized_offset);
end;
$function$;

create or replace function public.platform_subscription_detail(p_subscription_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare result jsonb;
begin
  if not exists (
    select 1 from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in ('platform_owner','platform_admin','finance')
  ) then
    raise exception 'PLATFORM_SUBSCRIPTION_ACCESS_DENIED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', subscription.id,
    'organizationId', organization.id,
    'organizationName', organization.name,
    'organizationStatus', coalesce(organization.status,'active'),
    'ownerEmail', (
      select owner_profile.email from public.organization_members owner_member
      left join public.profiles owner_profile on owner_profile.id = owner_member.user_id
      where owner_member.organization_id = organization.id and owner_member.role::text = 'owner'
      order by owner_member.created_at asc limit 1
    ),
    'status', subscription.status,
    'planId', plan.id,
    'planCode', plan.code,
    'planName', plan.name,
    'monthlyPriceCents', plan.monthly_price_cents,
    'billingProvider', subscription.billing_provider,
    'currentPeriodStart', subscription.current_period_start,
    'currentPeriodEnd', subscription.current_period_end,
    'cancelAtPeriodEnd', subscription.cancel_at_period_end,
    'lastPaymentStatus', subscription.last_payment_status,
    'pendingPlanCode', pending_plan.code,
    'scheduledPlanCode', scheduled_plan.code,
    'scheduledPlanEffectiveAt', subscription.scheduled_plan_effective_at,
    'pendingCheckout', subscription.paymongo_checkout_id is not null or subscription.provider_checkout_id is not null or subscription.pending_plan_id is not null,
    'providerCheckoutId', subscription.provider_checkout_id,
    'providerPaymentId', subscription.provider_payment_id,
    'paymongoCheckoutId', subscription.paymongo_checkout_id,
    'paymongoPaymentId', subscription.paymongo_payment_id,
    'paymentFailureCount', coalesce(subscription.payment_failure_count,0),
    'gracePeriodEndsAt', subscription.grace_period_ends_at,
    'activatedAt', subscription.activated_at,
    'cancelledAt', subscription.cancelled_at,
    'lifecycleVersion', coalesce(subscription.lifecycle_version,1),
    'updatedAt', subscription.updated_at,
    'lifecycle', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'eventType', event.event_type,
        'source', event.source,
        'previousStatus', event.previous_status,
        'newStatus', event.new_status,
        'planCode', event_plan.code,
        'actorUserId', event.actor_user_id,
        'metadata', event.metadata,
        'createdAt', event.created_at
      ) order by event.created_at desc)
      from public.subscription_lifecycle_events event
      left join public.subscription_plans event_plan on event_plan.id = event.plan_id
      where event.subscription_id = subscription.id
    ), '[]'::jsonb)
  ) into result
  from public.organization_subscriptions subscription
  join public.organizations organization on organization.id = subscription.organization_id
  join public.subscription_plans plan on plan.id = subscription.plan_id
  left join public.subscription_plans pending_plan on pending_plan.id = subscription.pending_plan_id
  left join public.subscription_plans scheduled_plan on scheduled_plan.id = subscription.scheduled_plan_id
  where subscription.id = p_subscription_id;

  return result;
end;
$function$;

create or replace function public.platform_schedule_subscription_plan_change(
  p_subscription_id uuid,
  p_plan_code text,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  target_plan public.subscription_plans%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')), '');
begin
  select * into actor from public.platform_users
  where user_id = auth.uid() and is_active = true and role in ('platform_owner','platform_admin','finance') limit 1;
  if actor.id is null then raise exception 'PLATFORM_SUBSCRIPTION_MANAGE_DENIED' using errcode = '42501'; end if;
  if normalized_reason is null or pg_catalog.char_length(normalized_reason) < 10 then raise exception 'PLATFORM_ACTION_REASON_REQUIRED' using errcode = '22023'; end if;

  select * into subscription_row from public.organization_subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found.'; end if;
  if subscription_row.status not in ('active','trialing') then raise exception 'The subscription must be active or trialing before a plan change can be scheduled.'; end if;
  if subscription_row.cancel_at_period_end then raise exception 'Revoke the scheduled cancellation before changing plans.'; end if;
  if subscription_row.paymongo_checkout_id is not null or subscription_row.provider_checkout_id is not null or subscription_row.pending_plan_id is not null then raise exception 'Complete or cancel the pending PayMongo checkout first.'; end if;
  if subscription_row.scheduled_plan_id is not null then raise exception 'A plan change is already scheduled.'; end if;
  if subscription_row.current_period_end is null or subscription_row.current_period_end <= pg_catalog.now() then raise exception 'A future billing-period end is required before a plan change can be scheduled.'; end if;

  select * into target_plan from public.subscription_plans
  where lower(code) = lower(pg_catalog.btrim(p_plan_code)) and is_active = true and billing_provider = 'paymongo' and code <> 'free' limit 1;
  if not found then raise exception 'PayMongo plan not found.'; end if;
  if subscription_row.plan_id = target_plan.id then raise exception 'The subscription already uses this plan.'; end if;

  update public.organization_subscriptions
  set scheduled_plan_id = target_plan.id,
      scheduled_plan_effective_at = subscription_row.current_period_end,
      lifecycle_version = coalesce(lifecycle_version,1) + 1,
      updated_at = pg_catalog.now()
  where id = subscription_row.id;

  insert into public.subscription_lifecycle_events(organization_id,subscription_id,event_type,source,previous_status,new_status,plan_id,actor_user_id,metadata)
  values(subscription_row.organization_id,subscription_row.id,'plan_change_scheduled','system',subscription_row.status,subscription_row.status,target_plan.id,actor.user_id,jsonb_build_object('platform_action',true,'platform_role',actor.role::text,'reason',normalized_reason,'effective','period_end','effective_at',subscription_row.current_period_end,'previous_plan_id',subscription_row.plan_id,'requires_paymongo_payment',true));

  insert into public.platform_audit_logs(platform_user_id,actor_user_id,actor_role,action,resource_type,resource_id,organization_id,reason,previous_state,resulting_state,metadata)
  values(actor.id,actor.user_id,actor.role,'subscription.plan_change_scheduled','subscription',subscription_row.id::text,subscription_row.organization_id,normalized_reason,jsonb_build_object('planId',subscription_row.plan_id),jsonb_build_object('scheduledPlanId',target_plan.id,'scheduledPlanCode',target_plan.code,'effectiveAt',subscription_row.current_period_end),jsonb_build_object('preservedPayMongoLifecycle',true,'requiresPayMongoPayment',true));

  return jsonb_build_object('ok',true,'plan_code',target_plan.code,'effective_at',subscription_row.current_period_end,'requires_paymongo_payment',true);
end;
$function$;

create or replace function public.platform_set_subscription_cancellation(
  p_subscription_id uuid,
  p_cancel_at_period_end boolean,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')), '');
begin
  select * into actor from public.platform_users where user_id = auth.uid() and is_active = true and role in ('platform_owner','platform_admin','finance') limit 1;
  if actor.id is null then raise exception 'PLATFORM_SUBSCRIPTION_MANAGE_DENIED' using errcode = '42501'; end if;
  if normalized_reason is null or pg_catalog.char_length(normalized_reason) < 10 then raise exception 'PLATFORM_ACTION_REASON_REQUIRED' using errcode = '22023'; end if;

  select * into subscription_row from public.organization_subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found.'; end if;
  if subscription_row.status not in ('active','trialing','past_due') then raise exception 'Subscription cancellation cannot be changed from its current state.'; end if;
  if subscription_row.cancel_at_period_end = p_cancel_at_period_end then return jsonb_build_object('ok',true,'unchanged',true,'cancel_at_period_end',p_cancel_at_period_end); end if;

  if p_cancel_at_period_end then
    if subscription_row.current_period_end is null or subscription_row.current_period_end <= pg_catalog.now() then raise exception 'A future billing-period end is required before cancellation can be scheduled.'; end if;
    update public.organization_subscriptions
    set cancel_at_period_end = true,
        scheduled_plan_id = null,
        scheduled_plan_effective_at = null,
        lifecycle_version = coalesce(lifecycle_version,1) + 1,
        updated_at = pg_catalog.now(),
        billing_metadata = coalesce(billing_metadata,'{}'::jsonb) || jsonb_build_object('cancellation_requested_at',pg_catalog.now(),'cancellation_requested_by',actor.user_id,'cancellation_requested_via','platform')
    where id = subscription_row.id;
  else
    if subscription_row.current_period_end is not null and subscription_row.current_period_end <= pg_catalog.now() then raise exception 'The cancellation has already taken effect. Complete a new PayMongo checkout to restore service.'; end if;
    update public.organization_subscriptions
    set cancel_at_period_end = false,
        cancelled_at = null,
        lifecycle_version = coalesce(lifecycle_version,1) + 1,
        updated_at = pg_catalog.now(),
        billing_metadata = coalesce(billing_metadata,'{}'::jsonb) - 'cancellation_requested_at' - 'cancellation_requested_by' - 'cancellation_requested_via'
    where id = subscription_row.id;
  end if;

  insert into public.subscription_lifecycle_events(organization_id,subscription_id,event_type,source,previous_status,new_status,plan_id,actor_user_id,metadata)
  values(subscription_row.organization_id,subscription_row.id,case when p_cancel_at_period_end then 'cancellation_scheduled' else 'cancellation_revoked' end,'system',subscription_row.status,subscription_row.status,subscription_row.plan_id,actor.user_id,jsonb_build_object('platform_action',true,'platform_role',actor.role::text,'reason',normalized_reason,'effective_at',case when p_cancel_at_period_end then subscription_row.current_period_end else null end));

  insert into public.platform_audit_logs(platform_user_id,actor_user_id,actor_role,action,resource_type,resource_id,organization_id,reason,previous_state,resulting_state,metadata)
  values(actor.id,actor.user_id,actor.role,case when p_cancel_at_period_end then 'subscription.cancellation_scheduled' else 'subscription.cancellation_revoked' end,'subscription',subscription_row.id::text,subscription_row.organization_id,normalized_reason,jsonb_build_object('cancelAtPeriodEnd',subscription_row.cancel_at_period_end),jsonb_build_object('cancelAtPeriodEnd',p_cancel_at_period_end),jsonb_build_object('preservedPayMongoLifecycle',true));

  return jsonb_build_object('ok',true,'cancel_at_period_end',p_cancel_at_period_end,'current_period_end',subscription_row.current_period_end);
end;
$function$;

create or replace function public.platform_cancel_scheduled_plan_change(
  p_subscription_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  scheduled_plan public.subscription_plans%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')), '');
begin
  select * into actor from public.platform_users where user_id = auth.uid() and is_active = true and role in ('platform_owner','platform_admin','finance') limit 1;
  if actor.id is null then raise exception 'PLATFORM_SUBSCRIPTION_MANAGE_DENIED' using errcode = '42501'; end if;
  if normalized_reason is null or pg_catalog.char_length(normalized_reason) < 10 then raise exception 'PLATFORM_ACTION_REASON_REQUIRED' using errcode = '22023'; end if;

  select * into subscription_row from public.organization_subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found.'; end if;
  if subscription_row.scheduled_plan_id is null then return jsonb_build_object('ok',true,'unchanged',true); end if;
  select * into scheduled_plan from public.subscription_plans where id = subscription_row.scheduled_plan_id;

  update public.organization_subscriptions
  set scheduled_plan_id = null, scheduled_plan_effective_at = null, lifecycle_version = coalesce(lifecycle_version,1) + 1, updated_at = pg_catalog.now()
  where id = subscription_row.id;

  insert into public.subscription_lifecycle_events(organization_id,subscription_id,event_type,source,previous_status,new_status,plan_id,actor_user_id,metadata)
  values(subscription_row.organization_id,subscription_row.id,'plan_change_cancelled','system',subscription_row.status,subscription_row.status,subscription_row.plan_id,actor.user_id,jsonb_build_object('platform_action',true,'platform_role',actor.role::text,'reason',normalized_reason,'cancelled_scheduled_plan_id',subscription_row.scheduled_plan_id,'cancelled_scheduled_plan_code',scheduled_plan.code));

  insert into public.platform_audit_logs(platform_user_id,actor_user_id,actor_role,action,resource_type,resource_id,organization_id,reason,previous_state,resulting_state,metadata)
  values(actor.id,actor.user_id,actor.role,'subscription.plan_change_cancelled','subscription',subscription_row.id::text,subscription_row.organization_id,normalized_reason,jsonb_build_object('scheduledPlanId',subscription_row.scheduled_plan_id,'scheduledPlanCode',scheduled_plan.code),jsonb_build_object('scheduledPlanId',null),jsonb_build_object('preservedPayMongoLifecycle',true));

  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.platform_subscription_metrics() from public, anon;
revoke all on function public.platform_subscription_plans() from public, anon;
revoke all on function public.platform_subscription_directory(text,text,text,integer,integer) from public, anon;
revoke all on function public.platform_subscription_detail(uuid) from public, anon;
revoke all on function public.platform_schedule_subscription_plan_change(uuid,text,text) from public, anon;
revoke all on function public.platform_set_subscription_cancellation(uuid,boolean,text) from public, anon;
revoke all on function public.platform_cancel_scheduled_plan_change(uuid,text) from public, anon;

grant execute on function public.platform_subscription_metrics() to authenticated;
grant execute on function public.platform_subscription_plans() to authenticated;
grant execute on function public.platform_subscription_directory(text,text,text,integer,integer) to authenticated;
grant execute on function public.platform_subscription_detail(uuid) to authenticated;
grant execute on function public.platform_schedule_subscription_plan_change(uuid,text,text) to authenticated;
grant execute on function public.platform_set_subscription_cancellation(uuid,boolean,text) to authenticated;
grant execute on function public.platform_cancel_scheduled_plan_change(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
