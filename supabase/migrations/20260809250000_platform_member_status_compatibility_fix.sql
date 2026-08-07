-- Flowtix Platform Customer / Organization Member Status Compatibility Fix
--
-- public.member_status contains: active, pending, inactive.
-- Platform Customer Management previously compared that enum directly with the
-- non-existent value 'suspended', and Organization Management attempted to
-- write 'suspended' into member.status.
--
-- Organization suspension is an organization-level lifecycle state. Existing
-- customer authorization already requires organizations.status = 'active', so
-- membership rows can and should retain their original statuses.
--
-- This forward-only migration does not alter the member_status enum, customer
-- roles, RLS model, PayMongo billing, or historical migration files.

begin;

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
            and coalesce(member.status::text, 'active') = 'suspended'
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
        and coalesce(member.status::text, 'active') = 'suspended'
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

create or replace function public.platform_set_organization_status(
  p_organization_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  organization_row public.organizations%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  member_snapshot jsonb := '{}'::jsonb;
  suspension_row public.organization_platform_suspensions%rowtype;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in ('platform_owner', 'platform_admin')
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_ORGANIZATION_MANAGE_DENIED'
      using errcode = '42501';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'INVALID_ORGANIZATION_STATUS'
      using errcode = '22023';
  end if;

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 10 then
    raise exception 'ORGANIZATION_ACTION_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = p_organization_id
  for update;

  if organization_row.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if organization_row.status = 'archived' then
    raise exception 'ARCHIVED_ORGANIZATION_READ_ONLY'
      using errcode = 'P0001';
  end if;

  if organization_row.status = p_status then
    return true;
  end if;

  if p_status = 'suspended' then
    select coalesce(
      jsonb_object_agg(
        member.id::text,
        coalesce(member.status::text, 'active')
      ),
      '{}'::jsonb
    )
    into member_snapshot
    from public.organization_members member
    where member.organization_id = p_organization_id;

    insert into public.organization_platform_suspensions (
      organization_id,
      platform_user_id,
      actor_user_id,
      reason,
      member_status_snapshot,
      suspended_at,
      reactivated_at
    )
    values (
      p_organization_id,
      actor.id,
      actor.user_id,
      normalized_reason,
      member_snapshot,
      pg_catalog.now(),
      null
    )
    on conflict (organization_id)
    do update set
      platform_user_id = excluded.platform_user_id,
      actor_user_id = excluded.actor_user_id,
      reason = excluded.reason,
      member_status_snapshot = excluded.member_status_snapshot,
      suspended_at = excluded.suspended_at,
      reactivated_at = null;

    update public.organizations
    set
      status = 'suspended',
      updated_at = pg_catalog.now()
    where id = p_organization_id;

  else
    select suspension.*
    into suspension_row
    from public.organization_platform_suspensions suspension
    where suspension.organization_id = p_organization_id
    for update;

    update public.organizations
    set
      status = 'active',
      updated_at = pg_catalog.now()
    where id = p_organization_id;

    if suspension_row.organization_id is not null then
      update public.organization_platform_suspensions
      set reactivated_at = pg_catalog.now()
      where organization_id = p_organization_id;
    end if;
  end if;

  insert into public.platform_audit_logs (
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
  values (
    actor.id,
    actor.user_id,
    actor.role,
    case
      when p_status = 'suspended'
        then 'organization.suspended'
      else 'organization.reactivated'
    end,
    'organization',
    p_organization_id::text,
    p_organization_id,
    normalized_reason,
    jsonb_build_object(
      'status',
      coalesce(organization_row.status, 'active')
    ),
    jsonb_build_object('status', p_status),
    jsonb_build_object(
      'preservedPayMongoLifecycle', true,
      'memberStatusSnapshotStored', p_status = 'suspended',
      'memberStatusesPreserved', true
    )
  );

  insert into public.organization_lifecycle_events (
    organization_id,
    event_type,
    previous_state,
    resulting_state,
    actor_user_id
  )
  values (
    p_organization_id,
    case
      when p_status = 'suspended'
        then 'platform_suspended'
      else 'platform_reactivated'
    end,
    jsonb_build_object(
      'status',
      coalesce(organization_row.status, 'active'),
      'reason',
      normalized_reason
    ),
    jsonb_build_object(
      'status',
      p_status,
      'reason',
      normalized_reason
    ),
    actor.user_id
  );

  return true;
end;
$function$;

revoke all on function public.platform_customer_directory(text,text,integer,integer)
from public, anon;
revoke all on function public.platform_customer_detail(uuid)
from public, anon;
revoke all on function public.platform_set_organization_status(uuid,text,text)
from public, anon;

grant execute on function public.platform_customer_directory(text,text,integer,integer)
to authenticated;
grant execute on function public.platform_customer_detail(uuid)
to authenticated;
grant execute on function public.platform_set_organization_status(uuid,text,text)
to authenticated;

notify pgrst, 'reload schema';

commit;
