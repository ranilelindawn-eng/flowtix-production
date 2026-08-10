begin;

-- Flowtix durable job idempotency / PostgREST upsert fix.
--
-- The job dispatcher uses Supabase/PostgREST conflict targeting on:
--   organization_id, idempotency_key
--
-- The existing index is partial:
--   WHERE idempotency_key IS NOT NULL
--
-- PostgREST cannot infer a partial unique index from a column-only conflict
-- target. A normal PostgreSQL UNIQUE index still allows multiple NULL values,
-- so removing the predicate preserves nullable idempotency keys while making
-- the conflict target valid for Supabase upserts.

drop index if exists public.background_jobs_idempotency_idx;

create unique index background_jobs_idempotency_idx
  on public.background_jobs (
    organization_id,
    idempotency_key
  );

commit;
