-- CallFlow Phase 7: reporting performance indexes
-- Reports use existing tenant-scoped CRM, telephony, activity, and team data.

create index if not exists calls_org_created_at_idx
  on public.calls (organization_id, created_at desc);
create index if not exists calls_org_created_by_idx
  on public.calls (organization_id, created_by, created_at desc);
create index if not exists opportunities_org_status_idx
  on public.opportunities (organization_id, status, updated_at desc);
create index if not exists opportunities_org_owner_idx
  on public.opportunities (organization_id, owner_id, updated_at desc);
create index if not exists notes_org_created_at_idx
  on public.notes (organization_id, created_at desc);
create index if not exists tasks_org_created_at_idx
  on public.contact_tasks (organization_id, created_at desc);
create index if not exists communications_org_created_at_idx
  on public.communication_messages (organization_id, created_at desc);
create index if not exists internal_comments_org_created_at_idx
  on public.internal_comments (organization_id, created_at desc);

-- Existing RLS policies remain the authority for tenant isolation.
-- No cross-organization security-definer reporting views are introduced.
