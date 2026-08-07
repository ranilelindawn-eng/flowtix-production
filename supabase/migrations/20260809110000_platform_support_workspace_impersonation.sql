-- Flowtix Platform Admin — Support Workspace Access
--
-- Audited, temporary, read-only support impersonation foundation.
--
-- This deliberately does NOT:
-- - insert Flowtix staff into organization_members;
-- - weaken existing customer RLS policies;
-- - impersonate a customer auth identity;
-- - permit customer-record mutations;
-- - expose service-role credentials to the browser.
--
-- Dedicated SECURITY DEFINER RPCs expose only a bounded support snapshot
-- after validating an active platform support session.

begin;

create table if not exists public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  platform_user_id uuid not null
    references public.platform_users(id) on delete cascade,
  actor_user_id uuid not null
    references auth.users(id) on delete cascade,
  actor_role public.platform_role not null,
  reason text not null,
  reference text,
  status text not null default 'active'
    check (status in ('active','ended')),
  started_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  outcome text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists platform_support_sessions_actor_idx
  on public.platform_support_sessions(actor_user_id, started_at desc);

create index if not exists platform_support_sessions_org_idx
  on public.platform_support_sessions(organization_id, started_at desc);

create index if not exists platform_support_sessions_active_idx
  on public.platform_support_sessions(actor_user_id, expires_at)
  where status = 'active';

alter table public.platform_support_sessions enable row level security;

revoke all on table public.platform_support_sessions
from public, anon, authenticated;

grant all on table public.platform_support_sessions
to service_role;

create or replace function public.platform_can_use_support_access()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.platform_users platform_user
      where platform_user.user_id = auth.uid()
        and platform_user.is_active = true
        and platform_user.role in (
          'platform_owner',
          'platform_admin',
          'support'
        )
    );
$function$;

create or replace function public.platform_start_support_session(
  p_organization_id uuid,
  p_reason text,
  p_reference text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  organization_row public.organizations%rowtype;
  normalized_reason text :=
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  normalized_reference text :=
    nullif(pg_catalog.btrim(coalesce(p_reference, '')), '');
  created_session_id uuid;
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

  if normalized_reason is null
     or pg_catalog.char_length(normalized_reason) < 15 then
    raise exception 'SUPPORT_ACCESS_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = p_organization_id;

  if organization_row.id is null then
    raise exception 'ORGANIZATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if coalesce(organization_row.status, 'active') = 'archived' then
    raise exception 'ARCHIVED_ORGANIZATION_SUPPORT_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  update public.platform_support_sessions session_row
  set
    status = 'ended',
    ended_at = pg_catalog.now(),
    outcome = coalesce(
      session_row.outcome,
      'Automatically ended when a new support session was started.'
    ),
    updated_at = pg_catalog.now()
  where session_row.actor_user_id = actor.user_id
    and session_row.status = 'active';

  insert into public.platform_support_sessions (
    organization_id,
    platform_user_id,
    actor_user_id,
    actor_role,
    reason,
    reference,
    status,
    started_at,
    expires_at
  )
  values (
    organization_row.id,
    actor.id,
    actor.user_id,
    actor.role,
    normalized_reason,
    normalized_reference,
    'active',
    pg_catalog.now(),
    pg_catalog.now() + interval '30 minutes'
  )
  returning id into created_session_id;

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
    'support.session_started',
    'support_session',
    created_session_id::text,
    organization_row.id,
    normalized_reason,
    null,
    jsonb_build_object(
      'status', 'active',
      'expiresAt', pg_catalog.now() + interval '30 minutes'
    ),
    jsonb_build_object(
      'reference', normalized_reference,
      'mode', 'read_only',
      'staffMembershipCreated', false,
      'customerRlsWeakened', false
    )
  );

  return created_session_id;
end;
$function$;

create or replace function public.platform_end_support_session(
  p_session_id uuid,
  p_outcome text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  actor public.platform_users%rowtype;
  session_row public.platform_support_sessions%rowtype;
  normalized_outcome text :=
    nullif(pg_catalog.btrim(coalesce(p_outcome, '')), '');
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
    raise exception 'SUPPORT_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if session_row.status = 'ended' then
    return true;
  end if;

  update public.platform_support_sessions
  set
    status = 'ended',
    ended_at = pg_catalog.now(),
    outcome = normalized_outcome,
    updated_at = pg_catalog.now()
  where id = session_row.id;

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
    'support.session_ended',
    'support_session',
    session_row.id::text,
    session_row.organization_id,
    session_row.reason,
    jsonb_build_object(
      'status', 'active',
      'startedAt', session_row.started_at,
      'expiresAt', session_row.expires_at
    ),
    jsonb_build_object(
      'status', 'ended',
      'endedAt', pg_catalog.now()
    ),
    jsonb_build_object(
      'reference', session_row.reference,
      'outcome', normalized_outcome,
      'mode', 'read_only'
    )
  );

  return true;
end;
$function$;

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
        'status',
          case
            when session_row.status = 'active'
              and session_row.expires_at <= pg_catalog.now()
              then 'expired'
            else session_row.status
          end,
        'startedAt', session_row.started_at,
        'expiresAt', session_row.expires_at,
        'endedAt', session_row.ended_at,
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
    and session_item.actor_user_id = actor.user_id;

  if session_row.id is null then
    return null;
  end if;

  if session_row.status <> 'active'
     or session_row.expires_at <= pg_catalog.now() then
    if session_row.status = 'active' then
      update public.platform_support_sessions
      set
        status = 'ended',
        ended_at = pg_catalog.now(),
        outcome = coalesce(outcome, 'Session expired automatically.'),
        updated_at = pg_catalog.now()
      where id = session_row.id;
    end if;

    return null;
  end if;

  select organization.*
  into organization_row
  from public.organizations organization
  where organization.id = session_row.organization_id;

  if organization_row.id is null then
    return null;
  end if;

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
          (
            select count(*)
            from public.organization_members member
            where member.organization_id = organization_row.id
          ),
        'contacts',
          (
            select count(*)
            from public.contacts contact
            where contact.organization_id = organization_row.id
          ),
        'campaigns',
          (
            select count(*)
            from public.campaigns campaign
            where campaign.organization_id = organization_row.id
          ),
        'calls',
          (
            select count(*)
            from public.calls call_row
            where call_row.organization_id = organization_row.id
          )
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
              'name',
                pg_catalog.btrim(
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

revoke all on function public.platform_can_use_support_access()
from public, anon;

revoke all on function public.platform_start_support_session(uuid,text,text)
from public, anon;

revoke all on function public.platform_end_support_session(uuid,text)
from public, anon;

revoke all on function public.platform_support_session_directory()
from public, anon;

revoke all on function public.platform_support_workspace_snapshot(uuid)
from public, anon;

grant execute on function public.platform_can_use_support_access()
to authenticated;

grant execute on function public.platform_start_support_session(uuid,text,text)
to authenticated;

grant execute on function public.platform_end_support_session(uuid,text)
to authenticated;

grant execute on function public.platform_support_session_directory()
to authenticated;

grant execute on function public.platform_support_workspace_snapshot(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
