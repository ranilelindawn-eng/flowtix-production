BEGIN;

CREATE TABLE IF NOT EXISTS public.background_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  worker_id text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS background_job_events_job_created_idx
  ON public.background_job_events (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS background_job_events_org_created_idx
  ON public.background_job_events (organization_id, created_at DESC);

ALTER TABLE public.background_job_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS background_jobs_select_org_members
  ON public.background_jobs;

DROP POLICY IF EXISTS background_jobs_select_org_admins
  ON public.background_jobs;

CREATE POLICY background_jobs_select_org_admins
ON public.background_jobs
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_admin(organization_id)
);

DROP POLICY IF EXISTS background_job_events_select_org_admins
  ON public.background_job_events;

CREATE POLICY background_job_events_select_org_admins
ON public.background_job_events
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_admin(organization_id)
);

DROP POLICY IF EXISTS background_job_events_service_role_all
  ON public.background_job_events;

CREATE POLICY background_job_events_service_role_all
ON public.background_job_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.background_job_events
  FROM anon, authenticated;
GRANT SELECT ON public.background_job_events TO authenticated;
GRANT ALL ON public.background_job_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_background_job_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_message text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'created';
    v_message := 'Background job created.';

    INSERT INTO public.background_job_events (
      job_id,
      organization_id,
      event_type,
      to_status,
      worker_id,
      message,
      metadata,
      created_by
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      v_event_type,
      NEW.status,
      NEW.locked_by,
      v_message,
      jsonb_build_object(
        'queue', NEW.queue,
        'job_type', NEW.job_type,
        'scheduled_at', NEW.scheduled_at,
        'priority', NEW.priority
      ),
      NEW.created_by
    );

    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event_type := CASE NEW.status
      WHEN 'processing' THEN 'claimed'
      WHEN 'completed' THEN 'completed'
      WHEN 'retrying' THEN 'retry_scheduled'
      WHEN 'failed' THEN 'failed'
      WHEN 'dead_letter' THEN 'dead_lettered'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'queued' THEN 'requeued'
      WHEN 'scheduled' THEN 'scheduled'
      ELSE 'status_changed'
    END;

    v_message := CASE NEW.status
      WHEN 'completed' THEN 'Background job completed.'
      WHEN 'retrying' THEN 'Background job scheduled for retry.'
      WHEN 'failed' THEN coalesce(NEW.last_error_message, 'Background job failed.')
      WHEN 'dead_letter' THEN coalesce(NEW.last_error_message, 'Background job moved to dead letter.')
      WHEN 'cancelled' THEN 'Background job cancelled.'
      WHEN 'processing' THEN 'Background job claimed by a worker.'
      WHEN 'queued' THEN 'Background job returned to the queue.'
      ELSE 'Background job status changed.'
    END;

    INSERT INTO public.background_job_events (
      job_id,
      organization_id,
      event_type,
      from_status,
      to_status,
      worker_id,
      message,
      metadata,
      created_by
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      v_event_type,
      OLD.status,
      NEW.status,
      NEW.locked_by,
      v_message,
      jsonb_build_object(
        'attempt_count', NEW.attempt_count,
        'max_attempts', NEW.max_attempts,
        'next_retry_at', NEW.next_retry_at,
        'error_code', NEW.last_error_code
      ),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_background_job_event_insert
  ON public.background_jobs;
DROP TRIGGER IF EXISTS record_background_job_event_update
  ON public.background_jobs;

CREATE TRIGGER record_background_job_event_insert
AFTER INSERT ON public.background_jobs
FOR EACH ROW
EXECUTE FUNCTION public.record_background_job_event();

CREATE TRIGGER record_background_job_event_update
AFTER UPDATE ON public.background_jobs
FOR EACH ROW
EXECUTE FUNCTION public.record_background_job_event();

CREATE OR REPLACE FUNCTION public.retry_background_job(
  p_job_id uuid
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.background_jobs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job
  FROM public.background_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Background job not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.organization_id IS NULL
     OR NOT public.is_org_admin(v_job.organization_id) THEN
    RAISE EXCEPTION 'Owner or admin access is required.' USING ERRCODE = '42501';
  END IF;

  IF v_job.status NOT IN ('failed', 'dead_letter', 'cancelled') THEN
    RAISE EXCEPTION 'Only failed, dead-lettered, or cancelled jobs can be retried.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_jobs
  SET
    status = 'queued',
    scheduled_at = now(),
    next_retry_at = NULL,
    started_at = NULL,
    completed_at = NULL,
    failed_at = NULL,
    locked_by = NULL,
    locked_at = NULL,
    heartbeat_at = NULL,
    lock_expires_at = NULL,
    last_error_code = NULL,
    last_error_message = NULL,
    result = NULL,
    attempt_count = 0
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_background_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_background_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_background_job(
  p_job_id uuid
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.background_jobs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job
  FROM public.background_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Background job not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.organization_id IS NULL
     OR NOT public.is_org_admin(v_job.organization_id) THEN
    RAISE EXCEPTION 'Owner or admin access is required.' USING ERRCODE = '42501';
  END IF;

  IF v_job.status NOT IN ('queued', 'scheduled', 'retrying') THEN
    RAISE EXCEPTION 'Only queued, scheduled, or retrying jobs can be cancelled.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.background_jobs
  SET
    status = 'cancelled',
    failed_at = now(),
    next_retry_at = NULL,
    locked_by = NULL,
    locked_at = NULL,
    heartbeat_at = NULL,
    lock_expires_at = NULL,
    last_error_code = 'CANCELLED_BY_ADMIN',
    last_error_message = 'Cancelled by an organization owner or administrator.'
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_background_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_background_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recover_stale_background_jobs()
RETURNS TABLE (
  recovered integer,
  dead_lettered integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered integer := 0;
  v_dead_lettered integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  WITH updated AS (
    UPDATE public.background_jobs
    SET
      status = CASE
        WHEN attempt_count >= max_attempts THEN 'dead_letter'
        ELSE 'retrying'
      END,
      failed_at = CASE
        WHEN attempt_count >= max_attempts THEN now()
        ELSE failed_at
      END,
      next_retry_at = CASE
        WHEN attempt_count >= max_attempts THEN NULL
        ELSE now()
      END,
      locked_by = NULL,
      locked_at = NULL,
      heartbeat_at = NULL,
      lock_expires_at = NULL,
      last_error_code = 'STALE_WORKER_LEASE',
      last_error_message = 'The worker lease expired before the job completed.'
    WHERE status = 'processing'
      AND lock_expires_at IS NOT NULL
      AND lock_expires_at <= now()
    RETURNING status
  )
  SELECT
    count(*) FILTER (WHERE status = 'retrying'),
    count(*) FILTER (WHERE status = 'dead_letter')
  INTO v_recovered, v_dead_lettered
  FROM updated;

  RETURN QUERY SELECT coalesce(v_recovered, 0), coalesce(v_dead_lettered, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_background_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_stale_background_jobs() TO service_role;

CREATE OR REPLACE FUNCTION public.get_background_job_stats(
  p_organization_id uuid
)
RETURNS TABLE (
  status text,
  job_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jobs.status, count(*)::bigint
  FROM public.background_jobs jobs
  WHERE jobs.organization_id = p_organization_id
    AND public.is_org_admin(p_organization_id)
  GROUP BY jobs.status
  ORDER BY jobs.status;
$$;

REVOKE ALL ON FUNCTION public.get_background_job_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_background_job_stats(uuid) TO authenticated;

COMMIT;
