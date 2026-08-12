begin;

-- Flowtix Data Exports: one-time recovery for exports that failed before the
-- CSV MIME fix was deployed.
--
-- The production Supabase cron worker already invokes /api/cron/process every
-- minute and that route already includes the reports queue. No manual worker
-- invocation is required.
--
-- This migration touches ONLY reports/exports.generate jobs that are waiting
-- to retry because of the now-fixed MIME error:
--   mime type text/csv; charset=utf-8 is not supported
--
-- It does not alter completed jobs, active processing leases, unrelated queues,
-- schedules, or any customer data.

with affected_jobs as (
  select b.id
  from public.background_jobs b
  where b.queue = 'reports'
    and b.job_type = 'exports.generate'
    and b.status = 'retrying'
    and coalesce(b.last_error_message, '') ilike
      '%mime type text/csv; charset=utf-8 is not supported%'
),
reset_exports as (
  update public.export_jobs e
  set
    status = 'queued',
    error_message = null,
    started_at = null,
    updated_at = now()
  where e.background_job_id in (select id from affected_jobs)
    and e.status = 'processing'
  returning e.id
)
update public.background_jobs b
set
  next_retry_at = now(),
  updated_at = now()
where b.id in (select id from affected_jobs);

commit;

notify pgrst, 'reload schema';
