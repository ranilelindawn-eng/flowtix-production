-- Flowtix Phase 2.7 — Jobs, System Health & Feature Flags Validation
--
-- Aligns System Health stale-job detection with the durable worker lease and
-- adds a read-only acceptance report across background jobs, System Health,
-- operational feature flags, audit history, and subscription entitlements.
--
-- No job is retried/cancelled here and no feature flag is mutated.

begin;

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
        and job.lock_expires_at is not null
        and job.lock_expires_at <= pg_catalog.now()
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

create or replace function public.platform_operations_acceptance_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  expected_flags constant text[] := array[
    'advanced_dashboards',
    'usage_billing',
    'threat_detection',
    'scheduled_exports'
  ];

  job_total bigint;
  job_ready bigint;
  job_processing bigint;
  stale_leases bigint;
  processing_without_lease bigint;
  retrying_without_next_retry bigint;
  terminal_with_worker_lock bigint;
  attempts_over_maximum bigint;
  dead_letter_before_maximum bigint;
  jobs_without_events bigint;

  health_overview jsonb;
  health_status text;
  health_score integer;
  health_stale_jobs integer;
  health_stale_matches boolean;

  configured_flags bigint;
  missing_expected_flags bigint;
  unknown_flags bigint;
  invalid_rollouts bigint;
  override_count bigint;
  archived_org_overrides bigint;
  entitlement_key_collisions bigint;

  job_audit_actions bigint;
  feature_flag_audit_actions bigint;

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
        'developer'
      )
  ) then
    raise exception 'PLATFORM_OPERATIONS_VALIDATION_DENIED'
      using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (
      where job.status in ('queued', 'scheduled', 'retrying')
    ),
    count(*) filter (where job.status = 'processing'),
    count(*) filter (
      where job.status = 'processing'
        and job.lock_expires_at is not null
        and job.lock_expires_at <= pg_catalog.now()
    ),
    count(*) filter (
      where job.status = 'processing'
        and job.lock_expires_at is null
    ),
    count(*) filter (
      where job.status = 'retrying'
        and job.next_retry_at is null
    ),
    count(*) filter (
      where job.status in ('completed', 'failed', 'cancelled', 'dead_letter')
        and (
          job.locked_by is not null
          or job.locked_at is not null
          or job.lock_expires_at is not null
        )
    ),
    count(*) filter (
      where job.attempt_count > job.max_attempts
    ),
    count(*) filter (
      where job.status = 'dead_letter'
        and job.attempt_count < job.max_attempts
    )
  into
    job_total,
    job_ready,
    job_processing,
    stale_leases,
    processing_without_lease,
    retrying_without_next_retry,
    terminal_with_worker_lock,
    attempts_over_maximum,
    dead_letter_before_maximum
  from public.background_jobs job;

  select count(*)
  into jobs_without_events
  from public.background_jobs job
  where not exists (
    select 1
    from public.background_job_events event
    where event.job_id = job.id
  );

  health_overview := public.platform_system_health_overview();
  health_status := coalesce(health_overview ->> 'status', 'unknown');
  health_score := coalesce((health_overview ->> 'score')::integer, 0);

  select coalesce((component.value -> 'details' ->> 'staleProcessing')::integer, 0)
  into health_stale_jobs
  from jsonb_array_elements(
    coalesce(health_overview -> 'components', '[]'::jsonb)
  ) component(value)
  where component.value ->> 'key' = 'jobs'
  limit 1;

  health_stale_jobs := coalesce(health_stale_jobs, 0);
  health_stale_matches := health_stale_jobs = stale_leases;

  select count(*)
  into configured_flags
  from public.platform_feature_flags;

  select count(*)
  into missing_expected_flags
  from unnest(expected_flags) expected(flag_key)
  where not exists (
    select 1
    from public.platform_feature_flags flag
    where flag.flag_key = expected.flag_key
  );

  select count(*)
  into unknown_flags
  from public.platform_feature_flags flag
  where not (flag.flag_key = any(expected_flags));

  select count(*)
  into invalid_rollouts
  from public.platform_feature_flags flag
  where flag.rollout_percentage < 0
     or flag.rollout_percentage > 100;

  select count(*)
  into override_count
  from public.organization_feature_flag_overrides;

  select count(*)
  into archived_org_overrides
  from public.organization_feature_flag_overrides override_row
  join public.organizations organization
    on organization.id = override_row.organization_id
  where coalesce(organization.status, 'active') = 'archived';

  select count(*)
  into entitlement_key_collisions
  from public.platform_feature_flags flag
  where exists (
    select 1
    from public.subscription_plans plan
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(plan.entitlements) = 'array'
          then plan.entitlements
        else '[]'::jsonb
      end
    ) entitlement(value)
    where entitlement.value = flag.flag_key
  );

  select
    count(*) filter (where audit.action like 'jobs.%'),
    count(*) filter (where audit.action like 'feature_flags.%')
  into job_audit_actions, feature_flag_audit_actions
  from public.platform_audit_logs audit;

  if stale_leases > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'stale_worker_leases',
        'severity', 'warning',
        'count', stale_leases,
        'message', 'Processing background jobs have expired durable worker leases and require recovery.'
      )
    );
  end if;

  if processing_without_lease > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'processing_without_lease',
        'severity', 'critical',
        'count', processing_without_lease,
        'message', 'Processing jobs exist without lock_expires_at, so worker ownership cannot be safely evaluated.'
      )
    );
  end if;

  if retrying_without_next_retry > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'retrying_without_next_retry',
        'severity', 'critical',
        'count', retrying_without_next_retry,
        'message', 'Retrying jobs are missing next_retry_at and may never become claimable.'
      )
    );
  end if;

  if terminal_with_worker_lock > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'terminal_job_retains_lock',
        'severity', 'warning',
        'count', terminal_with_worker_lock,
        'message', 'Terminal jobs still retain worker-lock metadata.'
      )
    );
  end if;

  if attempts_over_maximum > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'job_attempts_over_maximum',
        'severity', 'critical',
        'count', attempts_over_maximum,
        'message', 'Background job attempt_count exceeds max_attempts.'
      )
    );
  end if;

  if dead_letter_before_maximum > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'dead_letter_before_maximum',
        'severity', 'warning',
        'count', dead_letter_before_maximum,
        'message', 'Dead-letter jobs exist before exhausting their configured maximum attempts.'
      )
    );
  end if;

  if jobs_without_events > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'job_without_event_history',
        'severity', 'warning',
        'count', jobs_without_events,
        'message', 'Background jobs exist without durable background_job_events history.'
      )
    );
  end if;

  if not health_stale_matches then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'system_health_stale_job_mismatch',
        'severity', 'critical',
        'count', abs(health_stale_jobs - stale_leases),
        'message', 'System Health stale-job count does not match the durable lock-expiry source of truth.'
      )
    );
  end if;

  if missing_expected_flags > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'missing_operational_feature_flags',
        'severity', 'critical',
        'count', missing_expected_flags,
        'message', 'One or more deployed Flowtix operational feature flags are missing from platform_feature_flags.'
      )
    );
  end if;

  if unknown_flags > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'unknown_operational_feature_flags',
        'severity', 'warning',
        'count', unknown_flags,
        'message', 'Feature-flag rows exist that are not part of the currently deployed operational flag registry.'
      )
    );
  end if;

  if invalid_rollouts > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'invalid_feature_flag_rollout',
        'severity', 'critical',
        'count', invalid_rollouts,
        'message', 'Operational feature-flag rollout percentages are outside 0–100.'
      )
    );
  end if;

  if archived_org_overrides > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'archived_organization_feature_override',
        'severity', 'warning',
        'count', archived_org_overrides,
        'message', 'Archived organizations still have operational feature-flag overrides.'
      )
    );
  end if;

  if entitlement_key_collisions > 0 then
    findings := findings || jsonb_build_array(
      jsonb_build_object(
        'key', 'feature_flag_entitlement_collision',
        'severity', 'critical',
        'count', entitlement_key_collisions,
        'message', 'Operational feature-flag keys collide with paid subscription entitlement keys; the two control planes must remain separate.'
      )
    );
  end if;

  select
    count(*) filter (where finding.value ->> 'severity' = 'critical'),
    count(*) filter (where finding.value ->> 'severity' = 'warning')
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
    'jobs', jsonb_build_object(
      'total', job_total,
      'ready', job_ready,
      'processing', job_processing,
      'staleLeases', stale_leases,
      'processingWithoutLease', processing_without_lease,
      'retryingWithoutNextRetry', retrying_without_next_retry,
      'terminalWithWorkerLock', terminal_with_worker_lock,
      'attemptsOverMaximum', attempts_over_maximum,
      'deadLetterBeforeMaximum', dead_letter_before_maximum,
      'jobsWithoutEvents', jobs_without_events
    ),
    'health', jsonb_build_object(
      'status', health_status,
      'score', health_score,
      'staleJobsReported', health_stale_jobs,
      'staleLeaseCountMatches', health_stale_matches
    ),
    'flags', jsonb_build_object(
      'configured', configured_flags,
      'expectedOperationalFlags', cardinality(expected_flags),
      'missingExpectedFlags', missing_expected_flags,
      'unknownFlags', unknown_flags,
      'invalidRollouts', invalid_rollouts,
      'overrides', override_count,
      'archivedOrganizationOverrides', archived_org_overrides,
      'entitlementKeyCollisions', entitlement_key_collisions
    ),
    'audit', jsonb_build_object(
      'jobActions', job_audit_actions,
      'featureFlagActions', feature_flag_audit_actions
    ),
    'findings', findings
  );
end;
$function$;

revoke all on function public.platform_operations_acceptance_report()
from public, anon;

grant execute on function public.platform_operations_acceptance_report()
to authenticated;

comment on function public.platform_operations_acceptance_report() is
  'Read-only Phase 2.7 acceptance report for durable jobs, System Health, operational feature flags, audit history, and entitlement separation.';

notify pgrst, 'reload schema';

commit;
