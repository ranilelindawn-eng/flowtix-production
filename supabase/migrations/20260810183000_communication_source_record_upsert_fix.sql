begin;

-- Flowtix sequence communication idempotency fix.
--
-- The sequence worker uses Supabase/PostgREST upsert with:
--   onConflict: organization_id,source,source_record_id
--
-- PostgREST cannot infer the existing partial unique index because the
-- conflict target sent by the client contains only the columns and does not
-- include the index predicate. A normal PostgreSQL UNIQUE index still permits
-- multiple rows where source_record_id is NULL, so removing the predicate
-- preserves the intended nullable behavior while making the conflict target
-- usable by Supabase upsert.

drop index if exists public.communication_messages_source_record_unique_idx;

create unique index communication_messages_source_record_unique_idx
  on public.communication_messages (
    organization_id,
    source,
    source_record_id
  );

commit;
