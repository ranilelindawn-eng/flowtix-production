-- Flowtix Platform Admin — System Health
--
-- Read-only aggregated operational health over existing Flowtix systems.
-- No replacement monitoring architecture is introduced.
--
-- Sources:
-- - database_constraint_validation_failures
-- - background_jobs
-- - billing_payment_events
-- - platform_telephony_health_checks / telephony_provider_events
-- - platform_ai_health_checks / ai_usage_events
-- - platform_users
--
-- Detailed job administration remains reserved for the Background Jobs phase.

begin;

create or replace function public.platform_can_view_system_health()
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
          'support',
          'developer'
        )
    );
$function$;

create or replace function public.platform_system_health_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  database_failures integer := 0;
  pending_jobs integer := 0;
  processing_jobs integer := 0;
  failed_jobs_24h integer := 0;
  dead_letter_jobs integer := 0;
  stale_processing_jobs integer := 0;
  failed_billing_events integer := 0;
  dead_letter_billing_events integer := 0;
  billing_events_24h integer := 0;
  telephony_failures_24h integer := 0;
  telephony_verification_failures_24h integer := 0;
  ai_failures_24h integer := 0;
  ai_verification_failures_24h integer := 0;
  active_platform_users integer := 0;
  db_status text := 'healthy';
  jobs_status text := 'healthy';
  billing_status text := 'healthy';
  telephony_status text := 'healthy';
  ai_status text := 'healthy';
  access_status text := 'healthy';
  overall_status text := 'healthy';
  score integer := 100;
  components jsonb;
  incidents jsonb := '[]'::jsonb;
begin
  if not public.platform_can_view_system_health() then
    raise exception 'PLATFORM_SYSTEM_HEALTH_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select count(*)
  into database_failures
  from public.database_constraint_validation_failures;

  select
    count(*) filter (
      where job.status in ('queued', 'scheduled', 'retrying')
    ),
    count(*) filter (
      where job.status = 'processing'
    ),
    count(*) filter (
      where job.status = 'failed'
        and coalesce(job.failed_at, job.updated_at) >=
          pg_catalog.now() - interval '24 hours'
    ),
    count(*) filter (
      where job.status = 'dead_letter'
    ),
    count(*) filter (
      where job.status = 'processing'
        and coalesce(job.heartbeat_at, job.locked_at, job.started_at, job.updated_at)
          < pg_catalog.now() - interval '15 minutes'
    )
  into
    pending_jobs,
    processing_jobs,
    failed_jobs_24h,
    dead_letter_jobs,
    stale_processing_jobs
  from public.background_jobs job;

  select
    count(*) filter (
      where event.received_at >= pg_catalog.now() - interval '24 hours'
    ),
    count(*) filter (
      where event.status = 'failed'
    ),
    count(*) filter (
      where event.dead_lettered_at is not null
    )
  into
    billing_events_24h,
    failed_billing_events,
    dead_letter_billing_events
  from public.billing_payment_events event
  where event.provider = 'paymongo';

  select count(*)
  into telephony_failures_24h
  from public.telephony_provider_events event
  where event.occurred_at >= pg_catalog.now() - interval '24 hours'
    and (
      event.normalized_status = 'failed'
      or event.event_type ilike '%fail%'
      or event.event_type ilike '%error%'
      or event.raw_status ilike '%fail%'
      or event.raw_status ilike '%error%'
    );

  select count(*)
  into telephony_verification_failures_24h
  from public.platform_telephony_health_checks health
  where health.created_at >= pg_catalog.now() - interval '24 hours'
    and health.status = 'failed';

  select count(*)
  into ai_failures_24h
  from public.ai_usage_events usage_event
  where usage_event.created_at >= pg_catalog.now() - interval '24 hours'
    and usage_event.status = 'failed';

  select count(*)
  into ai_verification_failures_24h
  from public.platform_ai_health_checks health
  where health.created_at >= pg_catalog.now() - interval '24 hours'
    and health.status = 'failed';

  select count(*)
  into active_platform_users
  from public.platform_users platform_user
  where platform_user.is_active = true;

  db_status := case
    when database_failures > 0 then 'critical'
    else 'healthy'
  end;

  jobs_status := case
    when dead_letter_jobs > 0 or stale_processing_jobs > 2 then 'critical'
    when stale_processing_jobs > 0 or failed_jobs_24h > 0 then 'warning'
    else 'healthy'
  end;

  billing_status := case
    when dead_letter_billing_events > 0 then 'critical'
    when failed_billing_events > 0 then 'warning'
    else 'healthy'
  end;

  telephony_status := case
    when telephony_verification_failures_24h >= 3 then 'critical'
    when telephony_failures_24h > 0
      or telephony_verification_failures_24h > 0 then 'warning'
    else 'healthy'
  end;

  ai_status := case
    when ai_verification_failures_24h >= 3 then 'critical'
    when ai_failures_24h > 0
      or ai_verification_failures_24h > 0 then 'warning'
    else 'healthy'
  end;

  access_status := case
    when active_platform_users = 0 then 'critical'
    else 'healthy'
  end;

  score := 100
    - case db_status when 'critical' then 25 when 'warning' then 10 else 0 end
    - case jobs_status when 'critical' then 20 when 'warning' then 8 else 0 end
    - case billing_status when 'critical' then 20 when 'warning' then 8 else 0 end
    - case telephony_status when 'critical' then 15 when 'warning' then 6 else 0 end
    - case ai_status when 'critical' then 10 when 'warning' then 4 else 0 end
    - case access_status when 'critical' then 10 when 'warning' then 4 else 0 end;

  score := greatest(score, 0);

  overall_status := case
    when db_status = 'critical'
      or jobs_status = 'critical'
      or billing_status = 'critical'
      or telephony_status = 'critical'
      or ai_status = 'critical'
      or access_status = 'critical'
      then 'critical'
    when db_status = 'warning'
      or jobs_status = 'warning'
      or billing_status = 'warning'
      or telephony_status = 'warning'
      or ai_status = 'warning'
      or access_status = 'warning'
      then 'warning'
    else 'healthy'
  end;

  components := jsonb_build_array(
    jsonb_build_object(
      'key', 'database',
      'label', 'Database integrity',
      'status', db_status,
      'summary',
        case
          when database_failures = 0
            then 'No unresolved database constraint validation failures.'
          else database_failures::text ||
            ' unresolved database constraint validation failures require attention.'
        end,
      'details', jsonb_build_object(
        'constraintFailures', database_failures
      )
    ),
    jsonb_build_object(
      'key', 'jobs',
      'label', 'Background processing',
      'status', jobs_status,
      'summary',
        case
          when jobs_status = 'healthy'
            then 'Background processing has no failed, dead-lettered, or stale jobs requiring attention.'
          else 'Background processing contains failed, dead-lettered, or stale work.'
        end,
      'details', jsonb_build_object(
        'pending', pending_jobs,
        'processing', processing_jobs,
        'failedLast24Hours', failed_jobs_24h,
        'deadLetter', dead_letter_jobs,
        'staleProcessing', stale_processing_jobs
      )
    ),
    jsonb_build_object(
      'key', 'billing',
      'label', 'PayMongo billing',
      'status', billing_status,
      'summary',
        case
          when billing_status = 'healthy'
            then 'No failed or dead-lettered PayMongo webhook events are outstanding.'
          else 'PayMongo webhook processing contains outstanding failures.'
        end,
      'details', jsonb_build_object(
        'eventsLast24Hours', billing_events_24h,
        'failedEvents', failed_billing_events,
        'deadLetterEvents', dead_letter_billing_events
      )
    ),
    jsonb_build_object(
      'key', 'telephony',
      'label', 'Telephony providers',
      'status', telephony_status,
      'summary',
        case
          when telephony_status = 'healthy'
            then 'No telephony provider or platform verification failures were detected in the last 24 hours.'
          else 'Recent telephony provider or verification failures were detected.'
        end,
      'details', jsonb_build_object(
        'providerFailuresLast24Hours', telephony_failures_24h,
        'verificationFailuresLast24Hours',
          telephony_verification_failures_24h
      )
    ),
    jsonb_build_object(
      'key', 'ai',
      'label', 'AI providers',
      'status', ai_status,
      'summary',
        case
          when ai_status = 'healthy'
            then 'No AI request or provider-verification failures were detected in the last 24 hours.'
          else 'Recent AI request or provider-verification failures were detected.'
        end,
      'details', jsonb_build_object(
        'requestFailuresLast24Hours', ai_failures_24h,
        'verificationFailuresLast24Hours',
          ai_verification_failures_24h
      )
    ),
    jsonb_build_object(
      'key', 'platform_access',
      'label', 'Platform access',
      'status', access_status,
      'summary',
        case
          when active_platform_users > 0
            then 'At least one active Flowtix platform staff identity is configured.'
          else 'No active Flowtix platform staff identity is configured.'
        end,
      'details', jsonb_build_object(
        'activePlatformUsers', active_platform_users
      )
    )
  );

  if database_failures > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'database-constraint-failures',
        'severity', 'critical',
        'title', 'Database constraint validation failures',
        'detail', database_failures::text ||
          ' database constraints remain unvalidated.',
        'resourceType', 'database',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt',
          (
            select max(failure.attempted_at)
            from public.database_constraint_validation_failures failure
          )
      )
    );
  end if;

  if dead_letter_jobs > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'background-jobs-dead-letter',
        'severity', 'critical',
        'title', 'Dead-lettered background jobs',
        'detail', dead_letter_jobs::text ||
          ' background jobs are currently dead-lettered.',
        'resourceType', 'background_job',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt',
          (
            select max(job.updated_at)
            from public.background_jobs job
            where job.status = 'dead_letter'
          )
      )
    );
  end if;

  if stale_processing_jobs > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'background-jobs-stale',
        'severity',
          case when stale_processing_jobs > 2 then 'critical' else 'warning' end,
        'title', 'Stale processing jobs',
        'detail', stale_processing_jobs::text ||
          ' processing jobs have not heartbeated for at least 15 minutes.',
        'resourceType', 'background_job',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt', pg_catalog.now()
      )
    );
  end if;

  if failed_jobs_24h > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'background-jobs-failed',
        'severity', 'warning',
        'title', 'Recent background job failures',
        'detail', failed_jobs_24h::text ||
          ' jobs failed during the last 24 hours.',
        'resourceType', 'background_job',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt',
          (
            select max(coalesce(job.failed_at, job.updated_at))
            from public.background_jobs job
            where job.status = 'failed'
              and coalesce(job.failed_at, job.updated_at) >=
                pg_catalog.now() - interval '24 hours'
          )
      )
    );
  end if;

  if dead_letter_billing_events > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'billing-dead-letter',
        'severity', 'critical',
        'title', 'Dead-lettered PayMongo webhook events',
        'detail', dead_letter_billing_events::text ||
          ' PayMongo webhook events are dead-lettered.',
        'resourceType', 'billing_event',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt',
          (
            select max(event.dead_lettered_at)
            from public.billing_payment_events event
            where event.provider = 'paymongo'
              and event.dead_lettered_at is not null
          )
      )
    );
  elsif failed_billing_events > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'billing-failed-events',
        'severity', 'warning',
        'title', 'Failed PayMongo webhook events',
        'detail', failed_billing_events::text ||
          ' PayMongo webhook events are currently failed.',
        'resourceType', 'billing_event',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt',
          (
            select max(event.updated_at)
            from public.billing_payment_events event
            where event.provider = 'paymongo'
              and event.status = 'failed'
          )
      )
    );
  end if;

  if telephony_verification_failures_24h > 0
     or telephony_failures_24h > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'telephony-recent-failures',
        'severity',
          case
            when telephony_verification_failures_24h >= 3
              then 'critical'
            else 'warning'
          end,
        'title', 'Recent telephony provider failures',
        'detail',
          telephony_failures_24h::text ||
          ' provider errors and ' ||
          telephony_verification_failures_24h::text ||
          ' failed platform verifications were detected in the last 24 hours.',
        'resourceType', 'telephony',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt', pg_catalog.now()
      )
    );
  end if;

  if ai_verification_failures_24h > 0
     or ai_failures_24h > 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'ai-recent-failures',
        'severity',
          case
            when ai_verification_failures_24h >= 3
              then 'critical'
            else 'warning'
          end,
        'title', 'Recent AI provider failures',
        'detail',
          ai_failures_24h::text ||
          ' AI request failures and ' ||
          ai_verification_failures_24h::text ||
          ' failed platform verifications were detected in the last 24 hours.',
        'resourceType', 'ai',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt', pg_catalog.now()
      )
    );
  end if;

  if active_platform_users = 0 then
    incidents := incidents || jsonb_build_array(
      jsonb_build_object(
        'key', 'platform-access-none',
        'severity', 'critical',
        'title', 'No active platform staff identities',
        'detail',
          'Flowtix has no active platform_users records. Internal platform access would be unavailable.',
        'resourceType', 'platform_access',
        'resourceId', null,
        'organizationId', null,
        'organizationName', null,
        'occurredAt', pg_catalog.now()
      )
    );
  end if;

  return jsonb_build_object(
    'status', overall_status,
    'score', score,
    'checkedAt', pg_catalog.now(),
    'components', components,
    'incidents', incidents
  );
end;
$function$;

revoke all on function public.platform_can_view_system_health()
from public, anon;

revoke all on function public.platform_system_health_overview()
from public, anon;

grant execute on function public.platform_can_view_system_health()
to authenticated;

grant execute on function public.platform_system_health_overview()
to authenticated;

notify pgrst, 'reload schema';

commit;
