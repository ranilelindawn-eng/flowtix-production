begin;

-- Flowtix Data Exports trusted-worker source read grants
--
-- Confirmed production symptom:
--   reports worker claims exports.generate jobs
--   some jobs complete
--   others retry with:
--     Unable to read export data: permission denied for table <resource_table>
--
-- The export processor uses SUPABASE_SERVICE_ROLE_KEY. This migration grants
-- SELECT only to service_role for the exact CRM / analytics source tables and
-- lookup tables used by Data Exports. It does not grant customer-facing access
-- to anon/authenticated roles and does not weaken existing RLS.

grant usage on schema public to service_role;

grant select on table
  public.contacts,
  public.companies,
  public.opportunities,
  public.calls,
  public.campaigns,
  public.contact_tasks,
  public.crm_activities,
  public.call_recordings,
  public.call_transcripts,
  public.sales_analytics_snapshots,
  public.call_analytics_snapshots,
  public.agent_analytics_snapshots,
  public.campaign_analytics_snapshots,
  public.pipelines,
  public.pipeline_stages,
  public.profiles
to service_role;

commit;

notify pgrst, 'reload schema';
