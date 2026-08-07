-- Flowtix Platform Admin — Billing & PayMongo Operations
--
-- Staff-only billing telemetry, webhook diagnostics/replay, payments, invoices,
-- usage statements, and reconciliation.
--
-- PayMongo remains the sole active billing provider. No function in this
-- migration fabricates payment success, manually marks invoices paid, or
-- directly activates an unpaid subscription.

begin;

create or replace function public.platform_can_view_billing()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select exists (
    select 1
    from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in (
        'platform_owner',
        'platform_admin',
        'finance',
        'support'
      )
  );
$function$;

create or replace function public.platform_can_manage_billing()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select exists (
    select 1
    from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in (
        'platform_owner',
        'platform_admin',
        'finance'
      )
  );
$function$;

create or replace function public.platform_billing_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'revenueThisMonthCents',
      coalesce((
        select sum(payment.amount)
        from public.billing_payments payment
        where payment.provider = 'paymongo'
          and payment.status = 'paid'
          and payment.paid_at >= date_trunc('month', pg_catalog.now())
          and payment.paid_at < date_trunc('month', pg_catalog.now()) + interval '1 month'
      ), 0),
    'paidPaymentsThisMonth',
      (
        select count(*)
        from public.billing_payments payment
        where payment.provider = 'paymongo'
          and payment.status = 'paid'
          and payment.paid_at >= date_trunc('month', pg_catalog.now())
          and payment.paid_at < date_trunc('month', pg_catalog.now()) + interval '1 month'
      ),
    'failedPayments',
      (
        select count(*)
        from public.billing_payments payment
        where payment.provider = 'paymongo'
          and payment.status = 'failed'
      ),
    'failedWebhookEvents',
      (
        select count(*)
        from public.billing_payment_events event
        where event.provider = 'paymongo'
          and event.status = 'failed'
      ),
    'deadLetteredEvents',
      (
        select count(*)
        from public.billing_payment_events event
        where event.provider = 'paymongo'
          and event.dead_lettered_at is not null
      ),
    'openInvoices',
      (
        select count(*)
        from public.billing_invoices invoice
        where invoice.status in ('draft', 'open', 'uncollectible')
      ),
    'amountDueCents',
      coalesce((
        select sum(invoice.amount_due)
        from public.billing_invoices invoice
        where invoice.status in ('draft', 'open', 'uncollectible')
      ), 0),
    'openUsageStatements',
      (
        select count(*)
        from public.usage_billing_statements statement
        where statement.status = 'open'
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_billing_event_directory(
  p_search text default null,
  p_status text default null,
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
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  with filtered as (
    select
      event.*,
      organization.name as organization_name
    from public.billing_payment_events event
    left join public.organizations organization
      on organization.id = event.organization_id
    where event.provider = 'paymongo'
      and (
        normalized_status is null
        or event.status = normalized_status
      )
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or event.provider_event_id ilike '%' || normalized_search || '%'
        or event.event_type ilike '%' || normalized_search || '%'
        or coalesce(event.checkout_id, '') ilike '%' || normalized_search || '%'
        or coalesce(event.payment_id, '') ilike '%' || normalized_search || '%'
        or coalesce(event.plan_code, '') ilike '%' || normalized_search || '%'
      )
  ),
  page as (
    select *
    from filtered
    order by received_at desc
    limit safe_limit
    offset safe_offset
  )
  select jsonb_build_object(
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', page.id,
            'organizationId', page.organization_id,
            'organizationName', page.organization_name,
            'providerEventId', page.provider_event_id,
            'eventType', page.event_type,
            'livemode', page.livemode,
            'resourceType', page.provider_resource_type,
            'resourceId', page.provider_resource_id,
            'checkoutId', page.checkout_id,
            'paymentId', page.payment_id,
            'planCode', page.plan_code,
            'status', page.status,
            'processingAttempts', page.processing_attempts,
            'ignoredReason', page.ignored_reason,
            'errorMessage', page.error_message,
            'nextRetryAt', page.next_retry_at,
            'deadLetteredAt', page.dead_lettered_at,
            'replayedAt', page.replayed_at,
            'receivedAt', page.received_at,
            'processedAt', page.processed_at
          )
          order by page.received_at desc
        )
        from page
      ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', safe_limit,
    'offset', safe_offset
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_billing_payment_directory(
  p_search text default null,
  p_status text default null,
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
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  with filtered as (
    select payment.*, organization.name as organization_name
    from public.billing_payments payment
    join public.organizations organization
      on organization.id = payment.organization_id
    where payment.provider = 'paymongo'
      and (normalized_status is null or payment.status = normalized_status)
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or coalesce(payment.provider_payment_id, '') ilike '%' || normalized_search || '%'
        or coalesce(payment.provider_checkout_id, '') ilike '%' || normalized_search || '%'
        or coalesce(payment.provider_event_id, '') ilike '%' || normalized_search || '%'
        or coalesce(payment.plan_code, '') ilike '%' || normalized_search || '%'
      )
  ),
  page as (
    select * from filtered
    order by created_at desc
    limit safe_limit offset safe_offset
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'organizationId', page.organization_id,
        'organizationName', page.organization_name,
        'subscriptionId', page.subscription_id,
        'providerPaymentId', page.provider_payment_id,
        'providerCheckoutId', page.provider_checkout_id,
        'providerEventId', page.provider_event_id,
        'planCode', page.plan_code,
        'status', page.status,
        'amountCents', page.amount,
        'currency', page.currency,
        'failureCode', page.failure_code,
        'failureMessage', page.failure_message,
        'paidAt', page.paid_at,
        'refundedAt', page.refunded_at,
        'createdAt', page.created_at
      ) order by page.created_at desc) from page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', safe_limit,
    'offset', safe_offset
  ) into result;
  return result;
end;
$function$;

create or replace function public.platform_billing_invoice_directory(
  p_search text default null,
  p_status text default null,
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
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  with filtered as (
    select invoice.*, organization.name as organization_name
    from public.billing_invoices invoice
    join public.organizations organization
      on organization.id = invoice.organization_id
    where (normalized_status is null or invoice.status = normalized_status)
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or invoice.invoice_number ilike '%' || normalized_search || '%'
        or invoice.id::text ilike '%' || normalized_search || '%'
      )
  ),
  page as (
    select * from filtered
    order by created_at desc
    limit safe_limit offset safe_offset
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'organizationId', page.organization_id,
        'organizationName', page.organization_name,
        'subscriptionId', page.subscription_id,
        'paymentId', page.payment_id,
        'invoiceNumber', page.invoice_number,
        'status', page.status,
        'currency', page.currency,
        'subtotalCents', page.subtotal,
        'taxCents', page.tax,
        'totalCents', page.total,
        'amountPaidCents', page.amount_paid,
        'amountDueCents', page.amount_due,
        'periodStart', page.period_start,
        'periodEnd', page.period_end,
        'dueAt', page.due_at,
        'paidAt', page.paid_at,
        'createdAt', page.created_at
      ) order by page.created_at desc) from page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', safe_limit,
    'offset', safe_offset
  ) into result;
  return result;
end;
$function$;

create or replace function public.platform_billing_usage_directory(
  p_search text default null,
  p_status text default null,
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
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  with filtered as (
    select statement.*, organization.name as organization_name
    from public.usage_billing_statements statement
    join public.organizations organization
      on organization.id = statement.organization_id
    where (normalized_status is null or statement.status = normalized_status)
      and (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or statement.id::text ilike '%' || normalized_search || '%'
      )
  ),
  page as (
    select * from filtered
    order by period_start desc, created_at desc
    limit safe_limit offset safe_offset
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'organizationId', page.organization_id,
        'organizationName', page.organization_name,
        'subscriptionId', page.subscription_id,
        'periodStart', page.period_start,
        'periodEnd', page.period_end,
        'status', page.status,
        'currency', page.currency,
        'subtotalCents', page.subtotal,
        'invoiceId', page.invoice_id,
        'finalizedAt', page.finalized_at,
        'createdAt', page.created_at
      ) order by page.period_start desc, page.created_at desc) from page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', safe_limit,
    'offset', safe_offset
  ) into result;
  return result;
end;
$function$;

create or replace function public.platform_billing_event_detail(
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  event_row public.billing_payment_events%rowtype;
  organization_name text;
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select event.*
  into event_row
  from public.billing_payment_events event
  where event.id = p_event_id
    and event.provider = 'paymongo';

  if event_row.id is null then
    return null;
  end if;

  select organization.name
  into organization_name
  from public.organizations organization
  where organization.id = event_row.organization_id;

  select jsonb_build_object(
    'id', event_row.id,
    'organizationId', event_row.organization_id,
    'organizationName', organization_name,
    'providerEventId', event_row.provider_event_id,
    'eventType', event_row.event_type,
    'livemode', event_row.livemode,
    'signatureTimestamp', event_row.signature_timestamp,
    'resourceType', event_row.provider_resource_type,
    'resourceId', event_row.provider_resource_id,
    'checkoutId', event_row.checkout_id,
    'paymentId', event_row.payment_id,
    'planCode', event_row.plan_code,
    'status', event_row.status,
    'processingAttempts', event_row.processing_attempts,
    'ignoredReason', event_row.ignored_reason,
    'errorMessage', event_row.error_message,
    'nextRetryAt', event_row.next_retry_at,
    'deadLetteredAt', event_row.dead_lettered_at,
    'replayedAt', event_row.replayed_at,
    'receivedAt', event_row.received_at,
    'processedAt', event_row.processed_at,
    'providerPayloadStored', event_row.payload is not null
      and event_row.payload <> '{}'::jsonb,
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attempt.id,
        'attemptNumber', attempt.attempt_number,
        'outcome', attempt.outcome,
        'errorMessage', attempt.error_message,
        'durationMs', attempt.duration_ms,
        'createdAt', attempt.created_at
      ) order by attempt.attempt_number desc)
      from public.billing_webhook_attempts attempt
      where attempt.billing_event_id = event_row.id
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_billing_reconciliation_directory(
  p_search text default null,
  p_status text default null,
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
  normalized_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  normalized_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if not public.platform_can_view_billing() then
    raise exception 'PLATFORM_BILLING_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  with organizations_page as (
    select
      organization.id,
      organization.name,
      subscription.status as subscription_status
    from public.organizations organization
    left join public.organization_subscriptions subscription
      on subscription.organization_id = organization.id
    where (
      normalized_search is null
      or organization.name ilike '%' || normalized_search || '%'
      or organization.id::text ilike '%' || normalized_search || '%'
    )
      and (
        normalized_status is null
        or subscription.status = normalized_status
      )
    order by organization.name asc
    limit safe_limit offset safe_offset
  ),
  reconciled as (
    select
      page.id,
      page.name,
      public.get_paymongo_billing_reconciliation(page.id) as diagnostic
    from organizations_page page
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        diagnostic
        || jsonb_build_object(
          'organizationId', reconciled.id,
          'organizationName', reconciled.name
        )
        order by reconciled.name
      )
      from reconciled
    ), '[]'::jsonb),
    'total', (
      select count(*)
      from public.organizations organization
      left join public.organization_subscriptions subscription
        on subscription.organization_id = organization.id
      where (
        normalized_search is null
        or organization.name ilike '%' || normalized_search || '%'
        or organization.id::text ilike '%' || normalized_search || '%'
      )
        and (
          normalized_status is null
          or subscription.status = normalized_status
        )
    ),
    'limit', safe_limit,
    'offset', safe_offset
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_prepare_billing_webhook_replay(
  p_event_id uuid,
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
  event_row public.billing_payment_events%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin', 'finance')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_BILLING_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'PLATFORM_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select event.*
  into event_row
  from public.billing_payment_events event
  where event.id = p_event_id
    and event.provider = 'paymongo'
  for update;

  if event_row.id is null then
    raise exception 'PAYMONGO_BILLING_EVENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if event_row.status not in ('failed', 'ignored') then
    raise exception 'Only failed or ignored PayMongo events can be replayed.'
      using errcode = 'P0001';
  end if;

  if event_row.payload is null or event_row.payload = '{}'::jsonb then
    raise exception 'Stored PayMongo event payload is unavailable.'
      using errcode = 'P0001';
  end if;

  update public.billing_payment_events
  set
    status = 'received',
    next_retry_at = pg_catalog.now(),
    dead_lettered_at = null,
    ignored_reason = null,
    error_message = null,
    replayed_at = pg_catalog.now(),
    replayed_by = actor.user_id,
    updated_at = pg_catalog.now()
  where id = event_row.id;

  insert into public.platform_audit_logs(
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values(
    actor.id,
    actor.user_id,
    actor.role,
    'billing.paymongo.webhook_replay_requested',
    'billing_payment_event',
    event_row.id::text,
    event_row.organization_id,
    normalized_reason,
    jsonb_build_object(
      'status', event_row.status,
      'processingAttempts', event_row.processing_attempts,
      'deadLetteredAt', event_row.dead_lettered_at
    ),
    jsonb_build_object('status', 'received'),
    jsonb_build_object(
      'provider', 'paymongo',
      'providerEventId', event_row.provider_event_id,
      'eventType', event_row.event_type,
      'preservedPayMongoLifecycle', true
    )
  );

  return jsonb_build_object(
    'eventId', event_row.id,
    'providerEventId', event_row.provider_event_id,
    'signatureTimestamp', event_row.signature_timestamp,
    'payload', event_row.payload
  );
end;
$function$;

create or replace function public.platform_record_billing_replay_result(
  p_event_id uuid,
  p_success boolean,
  p_error_message text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  event_row public.billing_payment_events%rowtype;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin', 'finance')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_BILLING_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  select event.*
  into event_row
  from public.billing_payment_events event
  where event.id = p_event_id
    and event.provider = 'paymongo';

  if event_row.id is null then
    raise exception 'PAYMONGO_BILLING_EVENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  insert into public.platform_audit_logs(
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state,
    metadata
  )
  values(
    actor.id,
    actor.user_id,
    actor.role,
    case
      when p_success
        then 'billing.paymongo.webhook_replay_completed'
      else 'billing.paymongo.webhook_replay_failed'
    end,
    'billing_payment_event',
    event_row.id::text,
    event_row.organization_id,
    null,
    null,
    jsonb_build_object('status', event_row.status),
    jsonb_build_object(
      'provider', 'paymongo',
      'providerEventId', event_row.provider_event_id,
      'error', nullif(pg_catalog.left(coalesce(p_error_message, ''), 2000), '')
    )
  );

  return true;
end;
$function$;

revoke all on function public.platform_can_view_billing() from public, anon;
revoke all on function public.platform_can_manage_billing() from public, anon;
revoke all on function public.platform_billing_metrics() from public, anon;
revoke all on function public.platform_billing_event_directory(text,text,integer,integer) from public, anon;
revoke all on function public.platform_billing_payment_directory(text,text,integer,integer) from public, anon;
revoke all on function public.platform_billing_invoice_directory(text,text,integer,integer) from public, anon;
revoke all on function public.platform_billing_usage_directory(text,text,integer,integer) from public, anon;
revoke all on function public.platform_billing_event_detail(uuid) from public, anon;
revoke all on function public.platform_billing_reconciliation_directory(text,text,integer,integer) from public, anon;
revoke all on function public.platform_prepare_billing_webhook_replay(uuid,text) from public, anon;
revoke all on function public.platform_record_billing_replay_result(uuid,boolean,text) from public, anon;

grant execute on function public.platform_can_view_billing() to authenticated;
grant execute on function public.platform_can_manage_billing() to authenticated;
grant execute on function public.platform_billing_metrics() to authenticated;
grant execute on function public.platform_billing_event_directory(text,text,integer,integer) to authenticated;
grant execute on function public.platform_billing_payment_directory(text,text,integer,integer) to authenticated;
grant execute on function public.platform_billing_invoice_directory(text,text,integer,integer) to authenticated;
grant execute on function public.platform_billing_usage_directory(text,text,integer,integer) to authenticated;
grant execute on function public.platform_billing_event_detail(uuid) to authenticated;
grant execute on function public.platform_billing_reconciliation_directory(text,text,integer,integer) to authenticated;
grant execute on function public.platform_prepare_billing_webhook_replay(uuid,text) to authenticated;
grant execute on function public.platform_record_billing_replay_result(uuid,boolean,text) to authenticated;

notify pgrst, 'reload schema';

commit;
