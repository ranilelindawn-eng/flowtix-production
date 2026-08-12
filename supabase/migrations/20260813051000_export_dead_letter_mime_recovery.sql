begin;

-- Flowtix Data Exports
-- One-time recovery of exports that exhausted all retries on the OLD CSV MIME
-- error before the production processor was corrected to upload as text/csv.
--
-- IMPORTANT:
-- This targets ONLY:
--   queue      = reports
--   job_type   = exports.generate
--   status     = dead_letter
--   exact old MIME-error signature
--
-- It does not touch successful exports, unrelated jobs/queues, active worker
-- leases, schedules, CRM data, telephony, AI, billing, or customer permissions.

with affected_jobs as (
  select b.id
  from public.background_jobs b
  where b.queue = 'reports'
    and b.job_type = 'exports.generate'
    and b.status = 'dead_letter'
    and coalesce(b.last_error_message, '') ilike
      '%mime type text/csv; charset=utf-8 is not supported%'
),
reset_exports as (
  update public.export_jobs e
  set
    status = 'queued',
    started_at = null,
    completed_at = null,
    error_message = null,
    updated_at = now()
  where e.background_job_id in (select id from affected_jobs)
    and e.status = 'processing'
  returning e.id
)
update public.background_jobs b
set
  status = 'queued',
  attempt_count = 0,
  scheduled_at = now(),
  next_retry_at = null,
  started_at = null,
  completed_at = null,
  failed_at = null,
  locked_by = null,
  locked_at = null,
  heartbeat_at = null,
  lock_expires_at = null,
  last_error_code = null,
  last_error_message = null,
  result = null,
  updated_at = now()
where b.id in (select id from affected_jobs);

commit;

notify pgrst, 'reload schema';
