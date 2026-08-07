-- Flowtix Platform Admin — Customer Management
-- Staff-only customer directory and customer detail RPCs.
-- Customer organization memberships never grant access to these functions.
-- No customer RLS policy is weakened and no PayMongo lifecycle logic is changed.

begin;

create or replace function public.platform_customer_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.is_platform_user(null::public.platform_role[]) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totalOrganizations', (select count(*) from public.organizations),
    'activeOrganizations', (
      select count(*) from public.organizations organization
      where coalesce(organization.status, 'active') = 'active'
    ),
    'suspendedOrganizations', (
      select count(*) from public.organizations organization
      where coalesce(organization.status, 'active') = 'suspended'
    ),
    'totalUsers', (
      select count(distinct member.user_id)
      from public.organization_members member
      where coalesce(member.status, 'active') = 'active'
    ),
    'activeSubscriptions', (
      select count(*)
      from public.organization_subscriptions subscription
      where subscription.status in ('active', 'trialing', 'past_due')
    ),
    'trialCustomers', (
      select count(*)
      from public.organization_subscriptions subscription
      where subscription.status = 'trialing'
    )
  ) into result;

  return result;
end;
$function$;

create or replace function public.platform_customer_directory(
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
  normalized_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  normalized_offset integer := greatest(coalesce(p_offset, 0), 0);
  total_count bigint;
  items jsonb;
begin
  if not public.is_platform_user(null::public.platform_role[]) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;

  if normalized_status is not null
     and normalized_status not in ('active', 'suspended', 'archived') then
    raise exception 'INVALID_ORGANIZATION_STATUS' using errcode = '22023';
  end if;

  select count(*)
  into total_count
  from public.organizations organization
  where (
    normalized_status is null
    or coalesce(organization.status, 'active') = normalized_status
  )
  and (
    normalized_search is null
    or organization.name ilike '%' || normalized_search || '%'
    or coalesce(organization.slug, '') ilike '%' || normalized_search || '%'
    or exists (
      select 1
      from public.organization_members member
      left join public.profiles profile on profile.id = member.user_id
      where member.organization_id = organization.id
        and member.role::text = 'owner'
        and (
          coalesce(profile.email, '') ilike '%' || normalized_search || '%'
          or coalesce(profile.full_name, '') ilike '%' || normalized_search || '%'
        )
    )
  );

  select coalesce(
    jsonb_agg(customer_row.payload order by customer_row.created_at desc),
    '[]'::jsonb
  )
  into items
  from (
    select
      organization.created_at,
      jsonb_build_object(
        'id', organization.id,
        'name', organization.name,
        'slug', organization.slug,
        'status', coalesce(organization.status, 'active'),
        'timezone', coalesce(organization.timezone, 'UTC'),
        'createdAt', organization.created_at,
        'updatedAt', organization.updated_at,
        'memberCount', (
          select count(*)
          from public.organization_members member
          where member.organization_id = organization.id
            and coalesce(member.status, 'active') = 'active'
        ),
        'suspendedMemberCount', (
          select count(*)
          from public.organization_members member
          where member.organization_id = organization.id
            and coalesce(member.status, 'active') = 'suspended'
        ),
        'owner', (
          select jsonb_build_object(
            'userId', owner_member.user_id,
            'email', owner_profile.email,
            'fullName', owner_profile.full_name
          )
          from public.organization_members owner_member
          left join public.profiles owner_profile
            on owner_profile.id = owner_member.user_id
          where owner_member.organization_id = organization.id
            and owner_member.role::text = 'owner'
          order by owner_member.created_at asc
          limit 1
        ),
        'subscription', (
          select jsonb_build_object(
            'id', subscription.id,
            'status', subscription.status,
            'planCode', plan.code,
            'planName', plan.name,
            'monthlyPriceCents', plan.monthly_price_cents,
            'currentPeriodEnd', subscription.current_period_end,
            'cancelAtPeriodEnd', subscription.cancel_at_period_end,
            'lastPaymentStatus', subscription.last_payment_status,
            'billingProvider', subscription.billing_provider
          )
          from public.organization_subscriptions subscription
          join public.subscription_plans plan on plan.id = subscription.plan_id
          where subscription.organization_id = organization.id
          limit 1
        ),
        'usage', jsonb_build_object(
          'aiRequests', coalesce((
            select counter.units
            from public.organization_usage_counters counter
            where counter.organization_id = organization.id
              and counter.metric = 'ai_requests'
              and counter.period_start = public.usage_period_start()
          ), 0),
          'emails', coalesce((
            select counter.units
            from public.organization_usage_counters counter
            where counter.organization_id = organization.id
              and counter.metric = 'emails'
              and counter.period_start = public.usage_period_start()
          ), 0),
          'sms', coalesce((
            select counter.units
            from public.organization_usage_counters counter
            where counter.organization_id = organization.id
              and counter.metric = 'sms'
              and counter.period_start = public.usage_period_start()
          ), 0)
        )
      ) as payload
    from public.organizations organization
    where (
      normalized_status is null
      or coalesce(organization.status, 'active') = normalized_status
    )
    and (
      normalized_search is null
      or organization.name ilike '%' || normalized_search || '%'
      or coalesce(organization.slug, '') ilike '%' || normalized_search || '%'
      or exists (
        select 1
        from public.organization_members member
        left join public.profiles profile on profile.id = member.user_id
        where member.organization_id = organization.id
          and member.role::text = 'owner'
          and (
            coalesce(profile.email, '') ilike '%' || normalized_search || '%'
            or coalesce(profile.full_name, '') ilike '%' || normalized_search || '%'
          )
      )
    )
    order by organization.created_at desc
    limit normalized_limit
    offset normalized_offset
  ) customer_row;

  return jsonb_build_object(
    'items', items,
    'total', total_count,
    'limit', normalized_limit,
    'offset', normalized_offset
  );
end;
$function$;

create or replace function public.platform_customer_detail(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
begin
  if not public.is_platform_user(null::public.platform_role[]) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', organization.id,
    'name', organization.name,
    'slug', organization.slug,
    'status', coalesce(organization.status, 'active'),
    'timezone', coalesce(organization.timezone, 'UTC'),
    'createdAt', organization.created_at,
    'updatedAt', organization.updated_at,
    'memberCount', (
      select count(*)
      from public.organization_members member
      where member.organization_id = organization.id
        and coalesce(member.status, 'active') = 'active'
    ),
    'suspendedMemberCount', (
      select count(*)
      from public.organization_members member
      where member.organization_id = organization.id
        and coalesce(member.status, 'active') = 'suspended'
    ),
    'owner', (
      select jsonb_build_object(
        'userId', owner_member.user_id,
        'email', owner_profile.email,
        'fullName', owner_profile.full_name
      )
      from public.organization_members owner_member
      left join public.profiles owner_profile on owner_profile.id = owner_member.user_id
      where owner_member.organization_id = organization.id
        and owner_member.role::text = 'owner'
      order by owner_member.created_at asc
      limit 1
    ),
    'createdBy', (
      select jsonb_build_object(
        'userId', creator.id,
        'email', creator.email,
        'fullName', creator.full_name
      )
      from public.profiles creator
      where creator.id = organization.created_by
      limit 1
    ),
    'subscription', (
      select jsonb_build_object(
        'id', subscription.id,
        'status', subscription.status,
        'planCode', plan.code,
        'planName', plan.name,
        'monthlyPriceCents', plan.monthly_price_cents,
        'currentPeriodEnd', subscription.current_period_end,
        'cancelAtPeriodEnd', subscription.cancel_at_period_end,
        'lastPaymentStatus', subscription.last_payment_status,
        'billingProvider', subscription.billing_provider
      )
      from public.organization_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.organization_id = organization.id
      limit 1
    ),
    'usage', jsonb_build_object(
      'aiRequests', coalesce((
        select counter.units
        from public.organization_usage_counters counter
        where counter.organization_id = organization.id
          and counter.metric = 'ai_requests'
          and counter.period_start = public.usage_period_start()
      ), 0),
      'emails', coalesce((
        select counter.units
        from public.organization_usage_counters counter
        where counter.organization_id = organization.id
          and counter.metric = 'emails'
          and counter.period_start = public.usage_period_start()
      ), 0),
      'sms', coalesce((
        select counter.units
        from public.organization_usage_counters counter
        where counter.organization_id = organization.id
          and counter.metric = 'sms'
          and counter.period_start = public.usage_period_start()
      ), 0)
    ),
    'counts', jsonb_build_object(
      'contacts', (select count(*) from public.contacts contact where contact.organization_id = organization.id),
      'calls', (select count(*) from public.calls call_row where call_row.organization_id = organization.id),
      'campaigns', (select count(*) from public.campaigns campaign where campaign.organization_id = organization.id)
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', member.id,
          'userId', member.user_id,
          'role', member.role::text,
          'status', coalesce(member.status, 'active'),
          'email', profile.email,
          'fullName', profile.full_name,
          'createdAt', member.created_at
        )
        order by
          case member.role::text
            when 'owner' then 0
            when 'admin' then 1
            when 'manager' then 2
            else 3
          end,
          member.created_at asc
      )
      from public.organization_members member
      left join public.profiles profile on profile.id = member.user_id
      where member.organization_id = organization.id
    ), '[]'::jsonb)
  )
  into result
  from public.organizations organization
  where organization.id = p_organization_id;

  return result;
end;
$function$;

revoke all on function public.platform_customer_metrics() from public, anon;
revoke all on function public.platform_customer_directory(text, text, integer, integer) from public, anon;
revoke all on function public.platform_customer_detail(uuid) from public, anon;

grant execute on function public.platform_customer_metrics() to authenticated;
grant execute on function public.platform_customer_directory(text, text, integer, integer) to authenticated;
grant execute on function public.platform_customer_detail(uuid) to authenticated;

comment on function public.platform_customer_metrics() is
  'Staff-only Flowtix customer metrics. Requires active platform_users membership.';
comment on function public.platform_customer_directory(text, text, integer, integer) is
  'Staff-only customer directory. Customer organization roles never grant access.';
comment on function public.platform_customer_detail(uuid) is
  'Staff-only customer 360 view. Customer organization roles never grant access.';

notify pgrst, 'reload schema';

commit;
