begin;

-- Flowtix Data Exports trusted-worker permission fix
--
-- The export processor uses SUPABASE_SERVICE_ROLE_KEY. The worker successfully
-- claims reports/exports.generate jobs and generates/uploads the export, but
-- finalization currently fails with:
--
--   permission denied for table export_jobs
--
-- Keep customer access owner-only through the existing authenticated RLS
-- policies, while explicitly granting the trusted service_role the table
-- privileges required by background processing and scheduled-export execution.
--
-- This does NOT grant broader access to authenticated or anon users.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on table public.export_jobs
  to service_role;

grant select, insert, update, delete
  on table public.export_schedules
  to service_role;

-- Preserve the existing owner-only customer grants. These statements are
-- intentionally explicit so future privilege audits can distinguish user-facing
-- access from trusted worker access.
revoke all
  on table public.export_jobs, public.export_schedules
  from anon;

commit;

notify pgrst, 'reload schema';
