BEGIN;

-- The live database may not have campaign_members because the original
-- base table existed only in schema.sql. Create the enum and table safely
-- before extending it with the Phase 2.3 reservation fields.
DO $$
BEGIN
  CREATE TYPE public.campaign_member_status AS ENUM (
    'pending',
    'calling',
    'completed',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.campaign_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id)
    ON DELETE CASCADE,
  campaign_id uuid NOT NULL
    REFERENCES public.campaigns(id)
    ON DELETE CASCADE,
  contact_id uuid NOT NULL
    REFERENCES public.contacts(id)
    ON DELETE CASCADE,
  owner_membership_id uuid
    REFERENCES public.organization_members(id)
    ON DELETE SET NULL,
  status public.campaign_member_status NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  last_called_at timestamptz,
  last_disposition text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_members_campaign_contact_unique
    UNIQUE (campaign_id, contact_id),
  CONSTRAINT campaign_members_priority_nonnegative
    CHECK (priority >= 0),
  CONSTRAINT campaign_members_retry_count_nonnegative
    CHECK (retry_count >= 0)
);

ALTER TABLE public.campaign_members
  ADD COLUMN IF NOT EXISTS owner_membership_id uuid
    REFERENCES public.organization_members(id)
    ON DELETE SET NULL;

UPDATE public.campaign_members AS member
SET owner_membership_id = campaign.owner_membership_id
FROM public.campaigns AS campaign
WHERE campaign.id = member.campaign_id
  AND campaign.organization_id = member.organization_id
  AND member.owner_membership_id IS NULL;

ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_members_select ON public.campaign_members;
CREATE POLICY campaign_members_select
ON public.campaign_members
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS campaign_members_insert ON public.campaign_members;
CREATE POLICY campaign_members_insert
ON public.campaign_members
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_org_writer(organization_id)
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS campaign_members_update ON public.campaign_members;
CREATE POLICY campaign_members_update
ON public.campaign_members
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.is_org_writer(organization_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_org_writer(organization_id)
);

DROP POLICY IF EXISTS campaign_members_delete ON public.campaign_members;
CREATE POLICY campaign_members_delete
ON public.campaign_members
FOR DELETE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.is_org_writer(organization_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.campaign_members
TO authenticated;

GRANT ALL
ON public.campaign_members
TO service_role;


ALTER TABLE public.campaign_members
  ADD COLUMN IF NOT EXISTS reservation_token uuid,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_job_id uuid REFERENCES public.background_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text;

ALTER TABLE public.campaign_members
  DROP CONSTRAINT IF EXISTS campaign_members_max_attempts_valid;
ALTER TABLE public.campaign_members
  ADD CONSTRAINT campaign_members_max_attempts_valid
  CHECK (max_attempts BETWEEN 1 AND 25);

CREATE INDEX IF NOT EXISTS campaign_members_execution_ready_idx
  ON public.campaign_members (
    campaign_id,
    status,
    next_attempt_at,
    priority DESC,
    created_at
  )
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS campaign_members_reservation_expiry_idx
  ON public.campaign_members (reservation_expires_at)
  WHERE status = 'calling';

CREATE TABLE IF NOT EXISTS public.campaign_member_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_member_id uuid NOT NULL REFERENCES public.campaign_members(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN (
      'reserved',
      'preparing',
      'ready',
      'completed',
      'failed',
      'skipped',
      'released',
      'expired'
    )),
  reservation_token uuid NOT NULL,
  background_job_id uuid REFERENCES public.background_jobs(id) ON DELETE SET NULL,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  reservation_expires_at timestamptz NOT NULL,
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  released_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_member_id, attempt_number),
  UNIQUE (organization_id, reservation_token)
);

ALTER TABLE public.campaign_members
  DROP CONSTRAINT IF EXISTS campaign_members_current_attempt_id_fkey;
ALTER TABLE public.campaign_members
  ADD CONSTRAINT campaign_members_current_attempt_id_fkey
  FOREIGN KEY (current_attempt_id)
  REFERENCES public.campaign_member_attempts(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaign_member_attempts_member_idx
  ON public.campaign_member_attempts (campaign_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_member_attempts_campaign_idx
  ON public.campaign_member_attempts (organization_id, campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_member_attempts_status_idx
  ON public.campaign_member_attempts (status, reservation_expires_at);

CREATE OR REPLACE FUNCTION public.set_campaign_member_attempt_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_campaign_member_attempts_updated_at
  ON public.campaign_member_attempts;
CREATE TRIGGER set_campaign_member_attempts_updated_at
BEFORE UPDATE ON public.campaign_member_attempts
FOR EACH ROW
EXECUTE FUNCTION public.set_campaign_member_attempt_updated_at();

ALTER TABLE public.campaign_member_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_member_attempts_select_members
  ON public.campaign_member_attempts;
CREATE POLICY campaign_member_attempts_select_members
ON public.campaign_member_attempts
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_member_attempts_service_role_all
  ON public.campaign_member_attempts;
CREATE POLICY campaign_member_attempts_service_role_all
ON public.campaign_member_attempts
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.campaign_member_attempts
  FROM anon, authenticated;
GRANT SELECT ON public.campaign_member_attempts TO authenticated;
GRANT ALL ON public.campaign_member_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_campaign_members(
  p_campaign_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 900
)
RETURNS TABLE (scheduled integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled integer := 0;
  v_skipped integer := 0;
  v_member record;
  v_attempt_id uuid;
  v_job_id uuid;
  v_reservation_token uuid;
  v_attempt_number integer;
  v_key text;
  v_expiry timestamptz;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  v_expiry := now() + make_interval(
    secs => greatest(120, least(coalesce(p_lease_seconds, 900), 3600))
  );

  FOR v_member IN
    SELECT
      member.id,
      member.organization_id,
      member.campaign_id,
      member.contact_id,
      member.priority,
      member.retry_count,
      member.max_attempts,
      campaign.owner_membership_id
    FROM public.campaign_members member
    JOIN public.campaigns campaign
      ON campaign.id = member.campaign_id
     AND campaign.organization_id = member.organization_id
    WHERE campaign.status = 'active'
      AND (p_campaign_id IS NULL OR campaign.id = p_campaign_id)
      AND member.status IN ('pending', 'failed')
      AND coalesce(member.next_attempt_at, now()) <= now()
      AND member.processing_job_id IS NULL
      AND member.retry_count < member.max_attempts
    ORDER BY
      member.priority DESC,
      coalesce(member.next_attempt_at, member.created_at) ASC,
      member.created_at ASC
    FOR UPDATE OF member SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 25), 200))
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.contacts contact
      WHERE contact.id = v_member.contact_id
        AND contact.organization_id = v_member.organization_id
        AND contact.status <> 'archived'
    ) THEN
      UPDATE public.campaign_members
      SET
        status = 'skipped',
        last_error_code = 'CONTACT_UNAVAILABLE',
        last_error_message = 'The campaign contact is missing or archived.',
        completed_at = now(),
        updated_at = now()
      WHERE id = v_member.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_attempt_number := v_member.retry_count + 1;
    v_reservation_token := gen_random_uuid();
    v_key := format(
      'campaign-member:%s:attempt:%s',
      v_member.id,
      v_attempt_number
    );

    INSERT INTO public.campaign_member_attempts (
      organization_id,
      campaign_id,
      campaign_member_id,
      contact_id,
      attempt_number,
      status,
      reservation_token,
      reservation_expires_at
    ) VALUES (
      v_member.organization_id,
      v_member.campaign_id,
      v_member.id,
      v_member.contact_id,
      v_attempt_number,
      'reserved',
      v_reservation_token,
      v_expiry
    )
    ON CONFLICT (campaign_member_id, attempt_number)
    DO UPDATE SET
      reservation_token = excluded.reservation_token,
      reservation_expires_at = excluded.reservation_expires_at,
      status = 'reserved',
      background_job_id = NULL,
      call_id = NULL,
      error_code = NULL,
      error_message = NULL,
      reserved_at = now(),
      started_at = NULL,
      ready_at = NULL,
      completed_at = NULL,
      released_at = NULL,
      updated_at = now()
    RETURNING id INTO v_attempt_id;

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
    ) VALUES (
      v_member.organization_id,
      'campaigns',
      'campaign.execute_member',
      jsonb_build_object(
        'campaignId', v_member.campaign_id,
        'campaignMemberId', v_member.id,
        'contactId', v_member.contact_id,
        'attemptId', v_attempt_id,
        'reservationToken', v_reservation_token
      ),
      'queued',
      greatest(1, 100 - least(v_member.priority, 99)),
      now(),
      5,
      v_key,
      NULL
    )
    ON CONFLICT (organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO UPDATE SET updated_at = public.background_jobs.updated_at
    RETURNING id INTO v_job_id;

    UPDATE public.campaign_member_attempts
    SET background_job_id = v_job_id
    WHERE id = v_attempt_id;

    UPDATE public.campaign_members
    SET
      status = 'calling',
      reservation_token = v_reservation_token,
      reserved_at = now(),
      reservation_expires_at = v_expiry,
      processing_job_id = v_job_id,
      current_attempt_id = v_attempt_id,
      retry_count = v_attempt_number,
      next_attempt_at = NULL,
      last_error_code = NULL,
      last_error_message = NULL,
      updated_at = now()
    WHERE id = v_member.id;

    v_scheduled := v_scheduled + 1;
  END LOOP;

  RETURN QUERY SELECT v_scheduled, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_campaign_members(uuid, integer, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_campaign_members(uuid, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recover_expired_campaign_reservations(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (released integer, exhausted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released integer := 0;
  v_exhausted integer := 0;
  v_member record;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  FOR v_member IN
    SELECT id, current_attempt_id, retry_count, max_attempts
    FROM public.campaign_members
    WHERE status = 'calling'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at <= now()
    ORDER BY reservation_expires_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  LOOP
    UPDATE public.campaign_member_attempts
    SET
      status = 'expired',
      completed_at = now(),
      error_code = 'RESERVATION_EXPIRED',
      error_message = 'The campaign member reservation expired.'
    WHERE id = v_member.current_attempt_id
      AND status IN ('reserved', 'preparing', 'ready');

    IF v_member.retry_count >= v_member.max_attempts THEN
      UPDATE public.campaign_members
      SET
        status = 'failed',
        reservation_token = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        processing_job_id = NULL,
        current_attempt_id = NULL,
        next_attempt_at = NULL,
        last_error_code = 'MAX_ATTEMPTS_REACHED',
        last_error_message = 'The campaign member exhausted all attempts.',
        updated_at = now()
      WHERE id = v_member.id;
      v_exhausted := v_exhausted + 1;
    ELSE
      UPDATE public.campaign_members
      SET
        status = 'pending',
        reservation_token = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        processing_job_id = NULL,
        current_attempt_id = NULL,
        next_attempt_at = now() + interval '5 minutes',
        last_error_code = 'RESERVATION_EXPIRED',
        last_error_message = 'The previous reservation expired and was released.',
        updated_at = now()
      WHERE id = v_member.id;
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_released, v_exhausted;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_expired_campaign_reservations(integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_expired_campaign_reservations(integer)
  TO service_role;

COMMIT;
