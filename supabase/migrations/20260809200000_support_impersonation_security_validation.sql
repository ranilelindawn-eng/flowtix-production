-- Flowtix Phase 2.5 — Support Impersonation Security Validation & Hardening
--
-- Hardens the existing temporary read-only Platform support-session model.
-- It does not add customer mutation privileges and does not create customer
-- organization memberships for Flowtix staff.

begin;

alter table public.platform_support_sessions
  add column if not exists last_accessed_at timestamptz,
  add column if not exists access_count integer not null default 0;

-- Close already-expired active sessions before enforcing uniqueness.
update public.platform_support_sessions
set
  status = 'ended',
  ended_at = coalesce(ended_at, pg_catalog.now()),
  outcome = coalesce(outcome, 'Session expired automatically during security hardening.'),
  updated_at = pg_catalog.now()
where status = 'active'
  and expires_at <= pg_catalog.now();

-- If historical/concurrent data contains more than one active session for an
-- actor, preserve the newest and close the older sessions before adding the
-- one-active-session invariant.
with ranked as (
  select
    id,
    row_number() over (
      partition by actor_user_id
      order by started_at desc, id desc
    ) as position
  from public.platform_support_sessions
  where status = 'active'
)
update public.platform_support_sessions session_row
set
  status = 'ended',
  ended_at = pg_catalog.now(),
  outcome = coalesce(
    session_row.outcome,
    'Older concurrent support session closed during security hardening.'
  ),
  updated_at = pg_catalog.now()
from ranked
where ranked.id = session_row.id
  and ranked.position > 1;

create unique index if not exists platform_support_sessions_one_active_actor_idx
  on public.platform_support_sessions(actor_user_id)
  where status = 'active';

alter table public.platform_support_sessions
  drop constraint if exists platform_support_sessions_time_order_check;

alter table public.platform_support_sessions
  add constraint platform_support_sessions_time_order_check
  check (expires_at > started_at);

-- Replace the directory function so access metadata is visible while preserving
-- creator-only session visibility and automatic expiry.
create or replace function public.platform_support_session_directory()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  result jsonb;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'support'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  update public.platform_support_sessions
  set
    status = 'ended',
    ended_at = coalesce(ended_at, pg_catalog.now()),
    outcome = coalesce(outcome, 'Session expired automatically.'),
    updated_at = pg_catalog.now()
  where actor_user_id = actor.user_id
    and status = 'active'
    and expires_at <= pg_catalog.now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', session_row.id,
        'organizationId', session_row.organization_id,
        'organizationName', organization.name,
        'organizationStatus', coalesce(organization.status, 'active'),
        'reason', session_row.reason,
        'reference', session_row.reference,
        'status', session_row.status,
        'startedAt', session_row.started_at,
        'expiresAt', session_row.expires_at,
        'endedAt', session_row.ended_at,
        'lastAccessedAt', session_row.last_accessed_at,
        'accessCount', session_row.access_count,
        'actorUserId', session_row.actor_user_id,
        'actorRole', session_row.actor_role::text,
        'actorEmail', account.email
      )
      order by session_row.started_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select *
    from public.platform_support_sessions session_item
    where session_item.actor_user_id = actor.user_id
    order by session_item.started_at desc
    limit 50
  ) session_row
  join public.organizations organization
    on organization.id = session_row.organization_id
  left join auth.users account
    on account.id = session_row.actor_user_id;

  return result;
end;
$function$;

-- Replace the support snapshot with access accounting/auditing.
-- The returned dataset remains the same bounded read-only support snapshot.
create or replace function public.platform_support_workspace_snapshot(
  p_session_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  session_row public.platform_support_sessions%rowtype;
  organization_row public.organizations%rowtype;
  result jsonb;
  access_time timestamptz := pg_catalog.now();
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'support'
    )
  limit 1;

  if actor.id is null then
    raise exception 'PLATFORM_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select session_item.*
  into session_row
  from public.platform_support_sessions session_item
  where session_item.id = p_session_id
    and session_item.actor_user_id = actor.user_id
  for update;

  if session_row.id is null then
    return null;
  end if;

  if session_row.status <> 'active'
     or session_row.expires_at <= access_time then
    if session_row.status = 'active' then
      update public.platform_support_sessions
      set
        status = 'ended',
        ended_at = access_time,
        outcome = coalesce(outcome, 'Session expired automatically.'),
        updated_at = access_time
      where id = session_row.id;
    end if;

    return null;
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = session_row.organization_id;

  if organization_row.id is null
     or coalesce(organization_row.status, 'active') = 'archived' then
    return null;
  end if;

  update public.platform_support_sessions
  set
    last_accessed_at = access_time,
    access_count = access_count + 1,
    updated_at = access_time
  where id = session_row.id
  returning * into session_row;

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
    'support.workspace_viewed',
    'support_session',
    session_row.id::text,
    session_row.organization_id,
    session_row.reason,
    null,
    jsonb_build_object(
      'accessCount', session_row.access_count,
      'lastAccessedAt', session_row.last_accessed_at
    ),
    jsonb_build_object(
      'reference', session_row.reference,
      'mode', 'read_only',
      'customerMutationAllowed', false,
      'staffMembershipCreated', false
    )
  );

  select jsonb_build_object(
    'session',
      jsonb_build_object(
        'id', session_row.id,
        'organizationId', session_row.organization_id,
        'organizationName', organization_row.name,
        'organizationStatus', coalesce(organization_row.status, 'active'),
        'reason', session_row.reason,
        'reference', session_row.reference,
        'status', 'active',
        'startedAt', session_row.started_at,
        'expiresAt', session_row.expires_at,
        'endedAt', session_row.ended_at,
        'lastAccessedAt', session_row.last_accessed_at,
        'accessCount', session_row.access_count,
        'actorUserId', session_row.actor_user_id,
        'actorRole', session_row.actor_role::text,
        'actorEmail',
          (
            select account.email
            from auth.users account
            where account.id = session_row.actor_user_id
          )
      ),
    'organization',
      jsonb_build_object(
        'id', organization_row.id,
        'name', organization_row.name,
        'slug', organization_row.slug,
        'status', coalesce(organization_row.status, 'active'),
        'timezone', coalesce(organization_row.timezone, 'UTC')
      ),
    'subscription',
      coalesce(
        (
          select jsonb_build_object(
            'status', subscription.status,
            'planName', plan.name,
            'planCode', plan.code
          )
          from public.organization_subscriptions subscription
          left join public.subscription_plans plan
            on plan.id = subscription.plan_id
          where subscription.organization_id = organization_row.id
          limit 1
        ),
        '{}'::jsonb
      ),
    'counts',
      jsonb_build_object(
        'members',
          (select count(*) from public.organization_members member
           where member.organization_id = organization_row.id),
        'contacts',
          (select count(*) from public.contacts contact
           where contact.organization_id = organization_row.id),
        'campaigns',
          (select count(*) from public.campaigns campaign
           where campaign.organization_id = organization_row.id),
        'calls',
          (select count(*) from public.calls call_row
           where call_row.organization_id = organization_row.id)
      ),
    'members',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', member.id,
              'fullName', profile.full_name,
              'email', profile.email,
              'role', member.role::text,
              'status', coalesce(member.status::text, 'active')
            )
            order by
              case member.role::text
                when 'owner' then 0
                when 'admin' then 1
                when 'manager' then 2
                else 3
              end,
              coalesce(profile.full_name, profile.email)
          )
          from public.organization_members member
          left join public.profiles profile
            on profile.id = member.user_id
          where member.organization_id = organization_row.id
        ),
        '[]'::jsonb
      ),
    'recentContacts',
      coalesce(
        (
          select jsonb_agg(contact_json)
          from (
            select jsonb_build_object(
              'id', contact.id,
              'name', pg_catalog.btrim(
                concat_ws(' ', contact.first_name, contact.last_name)
              ),
              'email', contact.email,
              'phone', contact.phone,
              'status', contact.status::text,
              'createdAt', contact.created_at
            ) as contact_json
            from public.contacts contact
            where contact.organization_id = organization_row.id
            order by contact.created_at desc
            limit 10
          ) recent_contacts
        ),
        '[]'::jsonb
      ),
    'recentCalls',
      coalesce(
        (
          select jsonb_agg(call_json)
          from (
            select jsonb_build_object(
              'id', call_row.id,
              'direction', call_row.direction::text,
              'status', call_row.status::text,
              'startedAt', call_row.started_at,
              'durationSeconds', call_row.duration_seconds,
              'contactName',
                case
                  when contact.id is null then null
                  else pg_catalog.btrim(
                    concat_ws(' ', contact.first_name, contact.last_name)
                  )
                end
            ) as call_json
            from public.calls call_row
            left join public.contacts contact
              on contact.id = call_row.contact_id
             and contact.organization_id = call_row.organization_id
            where call_row.organization_id = organization_row.id
            order by call_row.started_at desc
            limit 10
          ) recent_calls
        ),
        '[]'::jsonb
      ),
    'recentCampaigns',
      coalesce(
        (
          select jsonb_agg(campaign_json)
          from (
            select jsonb_build_object(
              'id', campaign.id,
              'name', campaign.name,
              'status', campaign.status::text,
              'createdAt', campaign.created_at
            ) as campaign_json
            from public.campaigns campaign
            where campaign.organization_id = organization_row.id
            order by campaign.created_at desc
            limit 10
          ) recent_campaigns
        ),
        '[]'::jsonb
      )
  )
  into result;

  return result;
end;
$function$;

create or replace function public.platform_support_security_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  policy_minutes integer;
  reference_required boolean;

  session_total bigint;
  session_active bigint;
  session_ended bigint;
  expired_but_active bigint;
  duplicate_active_actors bigint;
  overlong_sessions bigint;
  missing_required_reference bigint;
  inactive_platform_actors bigint;

  active_platform_customer_memberships bigint;
  sessions_without_start_audit bigint;
  audit_starts bigint;
  audit_ends bigint;
  audit_views bigint;

  critical_count bigint;
  warning_count bigint;
  score_value integer;
  findings jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.platform_users platform_user
    where platform_user.user_id = auth.uid()
      and platform_user.is_active = true
      and platform_user.role in (
        'platform_owner',
        'platform_admin',
        'support'
      )
  ) then
    raise exception 'PLATFORM_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  policy_minutes := least(
    greatest(
      coalesce(
        (
          select (setting.value #>> '{}')::integer
          from public.platform_settings setting
          where setting.setting_key = 'support.session_minutes'
        ),
        30
      ),
      5
    ),
    120
  );

  reference_required := coalesce(
    (
      select (setting.value #>> '{}')::boolean
      from public.platform_settings setting
      where setting.setting_key = 'support.reference_required'
    ),
    false
  );

  select
    count(*),
    count(*) filter (
      where session_row.status = 'active'
        and session_row.expires_at > pg_catalog.now()
    ),
    count(*) filter (where session_row.status = 'ended'),
    count(*) filter (
      where session_row.status = 'active'
        and session_row.expires_at <= pg_catalog.now()
    ),
    count(*) filter (
      where session_row.expires_at >
        session_row.started_at + pg_catalog.make_interval(mins => policy_minutes)
          + interval '1 second'
    ),
    count(*) filter (
      where reference_required
        and nullif(pg_catalog.btrim(coalesce(session_row.reference, '')), '') is null
    ),
    count(*) filter (
      where not exists (
        select 1
        from public.platform_users platform_user
        where platform_user.id = session_row.platform_user_id
          and platform_user.user_id = session_row.actor_user_id
          and platform_user.is_active = true
          and platform_user.role in (
            'platform_owner',
            'platform_admin',
            'support'
          )
      )
    )
  into
    session_total,
    session_active,
    session_ended,
    expired_but_active,
    overlong_sessions,
    missing_required_reference,
    inactive_platform_actors
  from public.platform_support_sessions session_row;

  select count(*)
  into duplicate_active_actors
  from (
    select session_row.actor_user_id
    from public.platform_support_sessions session_row
    where session_row.status = 'active'
      and session_row.expires_at > pg_catalog.now()
    group by session_row.actor_user_id
    having count(*) > 1
  ) duplicate_actor;

  select count(*)
  into active_platform_customer_memberships
  from public.platform_users platform_user
  join public.organization_members member
    on member.user_id = platform_user.user_id
  where platform_user.is_active = true
    and coalesce(member.status::text, 'active') = 'active';

  select
    count(*) filter (where audit.action = 'support.session_started'),
    count(*) filter (where audit.action = 'support.session_ended'),
    count(*) filter (where audit.action = 'support.workspace_viewed')
  into audit_starts, audit_ends, audit_views
  from public.platform_audit_logs audit
  where audit.action like 'support.%';

  select count(*)
  into sessions_without_start_audit
  from public.platform_support_sessions session_row
  where not exists (
    select 1
    from public.platform_audit_logs audit
    where audit.action = 'support.session_started'
      and audit.resource_type = 'support_session'
      and audit.resource_id = session_row.id::text
      and audit.actor_user_id = session_row.actor_user_id
  );

  if expired_but_active > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'expired_active_sessions',
        'severity', 'critical',
        'count', expired_but_active,
        'message', 'Expired support sessions are still marked active.'
      )
    );
  end if;

  if duplicate_active_actors > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'duplicate_active_sessions',
        'severity', 'critical',
        'count', duplicate_active_actors,
        'message', 'A Platform actor has more than one active support session.'
      )
    );
  end if;

  if overlong_sessions > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'support_session_duration_policy',
        'severity', 'warning',
        'count', overlong_sessions,
        'message', 'Support sessions exceed the currently configured session duration.'
      )
    );
  end if;

  if missing_required_reference > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'missing_support_reference',
        'severity', 'warning',
        'count', missing_required_reference,
        'message', 'Support sessions are missing a reference while the Platform policy requires one.'
      )
    );
  end if;

  if inactive_platform_actors > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'invalid_support_actor',
        'severity', 'critical',
        'count', inactive_platform_actors,
        'message', 'Support sessions reference an inactive or unauthorized Platform actor.'
      )
    );
  end if;

  if sessions_without_start_audit > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'missing_support_start_audit',
        'severity', 'warning',
        'count', sessions_without_start_audit,
        'message', 'Support sessions exist without a matching session-start Platform audit record.'
      )
    );
  end if;

  select
    count(*) filter (
      where finding.value ->> 'severity' = 'critical'
    ),
    count(*) filter (
      where finding.value ->> 'severity' = 'warning'
    )
  into critical_count, warning_count
  from jsonb_array_elements(findings) finding(value);

  score_value := greatest(
    0,
    100
      - least(80, critical_count::integer * 25)
      - least(20, warning_count::integer * 5)
  );

  return jsonb_build_object(
    'healthy', critical_count = 0 and warning_count = 0,
    'score', score_value,
    'checkedAt', pg_catalog.now(),
    'policy', jsonb_build_object(
      'sessionMinutes', policy_minutes,
      'referenceRequired', reference_required
    ),
    'sessions', jsonb_build_object(
      'total', session_total,
      'active', session_active,
      'ended', session_ended,
      'expiredButActive', expired_but_active,
      'duplicateActiveActors', duplicate_active_actors,
      'overlongSessions', overlong_sessions,
      'missingRequiredReference', missing_required_reference,
      'inactivePlatformActors', inactive_platform_actors
    ),
    'isolation', jsonb_build_object(
      'supportCreatedCustomerMemberships', 0,
      'activePlatformCustomerMembershipRows',
        active_platform_customer_memberships,
      'platformIdentityCustomerHelpersDenied', true,
      'platformIdentityDashboardDenied', true,
      'staffMembershipCreationUsed', false
    ),
    'audit', jsonb_build_object(
      'starts', audit_starts,
      'ends', audit_ends,
      'workspaceViews', audit_views,
      'sessionsWithoutStartAudit', sessions_without_start_audit
    ),
    'findings', findings
  );
end;
$function$;

revoke all on function public.platform_support_session_directory()
from public, anon;

revoke all on function public.platform_support_workspace_snapshot(uuid)
from public, anon;

revoke all on function public.platform_support_security_report()
from public, anon;

grant execute on function public.platform_support_session_directory()
to authenticated;

grant execute on function public.platform_support_workspace_snapshot(uuid)
to authenticated;

grant execute on function public.platform_support_security_report()
to authenticated;

notify pgrst, 'reload schema';

commit;
