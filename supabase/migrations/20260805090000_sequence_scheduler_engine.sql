BEGIN;

ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS owner_membership_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_step_id uuid REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_job_id uuid REFERENCES public.background_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS sequence_enrollments_due_idx
  ON public.sequence_enrollments (status, next_run_at, organization_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS sequence_enrollments_owner_idx
  ON public.sequence_enrollments (organization_id, owner_membership_id);

UPDATE public.sequence_enrollments enrollment
SET owner_membership_id = member.id
FROM public.organization_members member
WHERE enrollment.owner_membership_id IS NULL
  AND member.organization_id = enrollment.organization_id
  AND member.user_id = enrollment.enrolled_by
  AND coalesce(member.status::text, 'active') = 'active';

CREATE TABLE IF NOT EXISTS public.sequence_step_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.sequence_steps(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  step_position integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','task','call')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','dispatched','completed','failed','skipped')),
  dispatch_job_id uuid REFERENCES public.background_jobs(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  provider_resource_type text,
  provider_resource_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, step_id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS sequence_step_executions_enrollment_idx
  ON public.sequence_step_executions (enrollment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sequence_step_executions_org_idx
  ON public.sequence_step_executions (organization_id, created_at DESC);

ALTER TABLE public.sequence_step_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sequence_step_executions_select_members ON public.sequence_step_executions;
CREATE POLICY sequence_step_executions_select_members
ON public.sequence_step_executions
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS sequence_step_executions_service_role_all ON public.sequence_step_executions;
CREATE POLICY sequence_step_executions_service_role_all
ON public.sequence_step_executions
FOR ALL TO service_role
USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.sequence_step_executions FROM anon, authenticated;
GRANT SELECT ON public.sequence_step_executions TO authenticated;
GRANT ALL ON public.sequence_step_executions TO service_role;

CREATE OR REPLACE FUNCTION public.set_sequence_execution_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_sequence_step_executions_updated_at ON public.sequence_step_executions;
CREATE TRIGGER set_sequence_step_executions_updated_at
BEFORE UPDATE ON public.sequence_step_executions
FOR EACH ROW EXECUTE FUNCTION public.set_sequence_execution_updated_at();

CREATE OR REPLACE FUNCTION public.set_sequence_enrollment_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_sequence_enrollments_updated_at ON public.sequence_enrollments;
CREATE TRIGGER set_sequence_enrollments_updated_at
BEFORE UPDATE ON public.sequence_enrollments
FOR EACH ROW EXECUTE FUNCTION public.set_sequence_enrollment_updated_at();

CREATE OR REPLACE FUNCTION public.enroll_contact_in_sequence(
  p_sequence_id uuid,
  p_contact_id uuid,
  p_owner_membership_id uuid DEFAULT NULL
)
RETURNS public.sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_contact public.contacts;
  v_owner uuid;
  v_first_delay integer := 0;
  v_enrollment public.sequence_enrollments;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sequence FROM public.sequences WHERE id = p_sequence_id;
  IF NOT FOUND OR NOT public.is_org_member(v_sequence.organization_id) THEN
    RAISE EXCEPTION 'Sequence not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_sequence.status <> 'active' THEN
    RAISE EXCEPTION 'Only active sequences can accept enrollments.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contact FROM public.contacts
  WHERE id = p_contact_id AND organization_id = v_sequence.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found in this organization.' USING ERRCODE = 'P0002';
  END IF;

  v_owner := coalesce(p_owner_membership_id, public.current_organization_membership_id(v_sequence.organization_id));
  IF v_owner IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.id = v_owner AND m.organization_id = v_sequence.organization_id
      AND coalesce(m.status::text, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'A valid active organization member is required.' USING ERRCODE = '42501';
  END IF;

  IF p_owner_membership_id IS NOT NULL
     AND p_owner_membership_id <> public.current_organization_membership_id(v_sequence.organization_id)
     AND NOT public.can_manage_organization_assignments(v_sequence.organization_id) THEN
    RAISE EXCEPTION 'You cannot assign this enrollment to another member.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(delay_days, 0) INTO v_first_delay
  FROM public.sequence_steps
  WHERE sequence_id = p_sequence_id AND position = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The sequence has no configured steps.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sequence_enrollments (
    organization_id, sequence_id, contact_id, current_step, status,
    next_run_at, enrolled_by, owner_membership_id,
    last_error, consecutive_failures, paused_at, cancelled_at, completed_at
  ) VALUES (
    v_sequence.organization_id, p_sequence_id, p_contact_id, 1, 'active',
    now() + make_interval(days => greatest(v_first_delay, 0)),
    v_user_id, v_owner, NULL, 0, NULL, NULL, NULL
  )
  ON CONFLICT (sequence_id, contact_id)
  DO UPDATE SET
    status = 'active',
    current_step = 1,
    next_run_at = excluded.next_run_at,
    enrolled_by = excluded.enrolled_by,
    owner_membership_id = excluded.owner_membership_id,
    processing_job_id = NULL,
    last_step_id = NULL,
    last_error = NULL,
    consecutive_failures = 0,
    paused_at = NULL,
    cancelled_at = NULL,
    completed_at = NULL,
    updated_at = now()
  RETURNING * INTO v_enrollment;

  RETURN v_enrollment;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_contact_in_sequence(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_contact_in_sequence(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_due_sequence_enrollments(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (scheduled integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled integer := 0;
  v_skipped integer := 0;
  record_row record;
  v_step public.sequence_steps;
  v_job_id uuid;
  v_key text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  FOR record_row IN
    SELECT enrollment.id, enrollment.organization_id, enrollment.sequence_id,
           enrollment.contact_id, enrollment.current_step
    FROM public.sequence_enrollments enrollment
    JOIN public.sequences sequence ON sequence.id = enrollment.sequence_id
    WHERE enrollment.status = 'active'
      AND sequence.status = 'active'
      AND enrollment.next_run_at IS NOT NULL
      AND enrollment.next_run_at <= now()
      AND enrollment.processing_job_id IS NULL
    ORDER BY enrollment.next_run_at ASC
    FOR UPDATE OF enrollment SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 50), 250))
  LOOP
    SELECT * INTO v_step FROM public.sequence_steps
    WHERE sequence_id = record_row.sequence_id
      AND position = record_row.current_step;

    IF NOT FOUND THEN
      UPDATE public.sequence_enrollments
      SET status = 'completed', completed_at = now(), next_run_at = NULL,
          processing_job_id = NULL, last_error = NULL
      WHERE id = record_row.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_key := format('sequence-step:%s:%s', record_row.id, v_step.id);

    INSERT INTO public.background_jobs (
      organization_id, queue, job_type, payload, status, priority,
      scheduled_at, max_attempts, idempotency_key, created_by
    ) VALUES (
      record_row.organization_id, 'sequences', 'sequence.execute_step',
      jsonb_build_object(
        'enrollmentId', record_row.id,
        'sequenceId', record_row.sequence_id,
        'stepId', v_step.id,
        'contactId', record_row.contact_id,
        'stepPosition', record_row.current_step
      ),
      'queued', 75, now(), 5, v_key, NULL
    )
    ON CONFLICT (organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO UPDATE SET updated_at = public.background_jobs.updated_at
    RETURNING id INTO v_job_id;

    UPDATE public.sequence_enrollments
    SET processing_job_id = v_job_id, next_run_at = NULL, updated_at = now()
    WHERE id = record_row.id;

    v_scheduled := v_scheduled + 1;
  END LOOP;

  RETURN QUERY SELECT v_scheduled, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_due_sequence_enrollments(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_due_sequence_enrollments(integer) TO service_role;

COMMIT;
