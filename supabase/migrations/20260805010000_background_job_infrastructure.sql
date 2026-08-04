BEGIN;

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  queue text NOT NULL DEFAULT 'default',
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'scheduled',
      'processing',
      'retrying',
      'completed',
      'failed',
      'cancelled',
      'dead_letter'
    )),
  priority integer NOT NULL DEFAULT 100,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 25),
  next_retry_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  lock_expires_at timestamptz,
  idempotency_key text,
  last_error_code text,
  last_error_message text,
  result jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS background_jobs_ready_idx
  ON public.background_jobs (
    queue,
    status,
    scheduled_at,
    priority,
    created_at
  )
  WHERE status IN ('queued', 'scheduled', 'retrying');

CREATE INDEX IF NOT EXISTS background_jobs_org_created_idx
  ON public.background_jobs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS background_jobs_lock_expiry_idx
  ON public.background_jobs (lock_expires_at)
  WHERE status = 'processing';

CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_idempotency_idx
  ON public.background_jobs (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_background_job_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_background_jobs_updated_at
  ON public.background_jobs;

CREATE TRIGGER set_background_jobs_updated_at
BEFORE UPDATE ON public.background_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_background_job_updated_at();

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS background_jobs_select_org_members
  ON public.background_jobs;

CREATE POLICY background_jobs_select_org_members
ON public.background_jobs
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS background_jobs_service_role_all
  ON public.background_jobs;

CREATE POLICY background_jobs_service_role_all
ON public.background_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.background_jobs FROM anon, authenticated;
GRANT SELECT ON public.background_jobs TO authenticated;
GRANT ALL ON public.background_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_background_job(
  p_organization_id uuid,
  p_queue text,
  p_job_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_scheduled_at timestamptz DEFAULT now(),
  p_priority integer DEFAULT 100,
  p_max_attempts integer DEFAULT 5,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job public.background_jobs;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Organization membership required.' USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_queue, '')) = '' THEN
    RAISE EXCEPTION 'Queue is required.' USING ERRCODE = '22023';
  END IF;

  IF btrim(coalesce(p_job_type, '')) = '' THEN
    RAISE EXCEPTION 'Job type is required.' USING ERRCODE = '22023';
  END IF;

  IF p_max_attempts < 1 OR p_max_attempts > 25 THEN
    RAISE EXCEPTION 'max_attempts must be between 1 and 25.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.background_jobs (
    organization_id,
    queue,
    job_type,
    payload,
    status,
    priority,
    scheduled_at,
    max_attempts,
    idempotency_key,
    created_by
  )
  VALUES (
    p_organization_id,
    btrim(p_queue),
    btrim(p_job_type),
    coalesce(p_payload, '{}'::jsonb),
    CASE WHEN coalesce(p_scheduled_at, now()) > now() THEN 'scheduled' ELSE 'queued' END,
    p_priority,
    coalesce(p_scheduled_at, now()),
    p_max_attempts,
    nullif(btrim(coalesce(p_idempotency_key, '')), ''),
    v_user_id
  )
  ON CONFLICT (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO UPDATE SET updated_at = public.background_jobs.updated_at
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_background_job(
  uuid, text, text, jsonb, timestamptz, integer, integer, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_background_job(
  uuid, text, text, jsonb, timestamptz, integer, integer, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_background_jobs(
  p_worker_id text,
  p_queues text[] DEFAULT ARRAY['default']::text[],
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_worker_id, '')) = '' THEN
    RAISE EXCEPTION 'Worker ID is required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.background_jobs
    WHERE queue = ANY(p_queues)
      AND (
        (
          status IN ('queued', 'scheduled', 'retrying')
          AND coalesce(next_retry_at, scheduled_at) <= now()
        )
        OR (
          status = 'processing'
          AND lock_expires_at IS NOT NULL
          AND lock_expires_at <= now()
        )
      )
    ORDER BY priority ASC, coalesce(next_retry_at, scheduled_at) ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 100))
  )
  UPDATE public.background_jobs AS jobs
  SET
    status = 'processing',
    started_at = coalesce(jobs.started_at, now()),
    attempt_count = jobs.attempt_count + 1,
    locked_by = p_worker_id,
    locked_at = now(),
    heartbeat_at = now(),
    lock_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))),
    next_retry_at = NULL,
    last_error_code = NULL,
    last_error_message = NULL
  FROM candidates
  WHERE jobs.id = candidates.id
  RETURNING jobs.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_background_jobs(text, text[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_background_jobs(text, text[], integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.background_jobs
  SET
    heartbeat_at = now(),
    lock_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600)))
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_by = p_worker_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_background_job(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_background_job(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.background_jobs
  SET
    status = 'completed',
    completed_at = now(),
    result = p_result,
    locked_by = NULL,
    locked_at = NULL,
    heartbeat_at = NULL,
    lock_expires_at = NULL,
    last_error_code = NULL,
    last_error_message = NULL
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_by = p_worker_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_background_job(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_background_job(uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean DEFAULT true
)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.background_jobs;
  v_delay_seconds integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job
  FROM public.background_jobs
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_by = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job is not owned by this worker.' USING ERRCODE = '55000';
  END IF;

  IF NOT p_retryable OR v_job.attempt_count >= v_job.max_attempts THEN
    UPDATE public.background_jobs
    SET
      status = CASE WHEN p_retryable THEN 'dead_letter' ELSE 'failed' END,
      failed_at = now(),
      last_error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
      last_error_message = left(coalesce(p_error_message, 'Unknown job failure.'), 4000),
      locked_by = NULL,
      locked_at = NULL,
      heartbeat_at = NULL,
      lock_expires_at = NULL,
      next_retry_at = NULL
    WHERE id = p_job_id
    RETURNING * INTO v_job;
  ELSE
    v_delay_seconds := least(
      3600,
      greatest(30, (30 * power(2, greatest(v_job.attempt_count - 1, 0)))::integer)
    );

    UPDATE public.background_jobs
    SET
      status = 'retrying',
      next_retry_at = now() + make_interval(secs => v_delay_seconds),
      last_error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
      last_error_message = left(coalesce(p_error_message, 'Unknown job failure.'), 4000),
      locked_by = NULL,
      locked_at = NULL,
      heartbeat_at = NULL,
      lock_expires_at = NULL
    WHERE id = p_job_id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_background_job(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_background_job(uuid, text, text, text, boolean) TO service_role;

COMMIT;
