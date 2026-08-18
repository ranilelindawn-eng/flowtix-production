-- Flowtix Conversations: manual outbound RLS correction
--
-- Purpose:
--   Allow owner/admin/manager users who already have communications.create to
--   create a new manual outbound Email/SMS message without depending on the
--   conversation row created by the BEFORE INSERT threading trigger being
--   visible to the original INSERT policy in the same statement.
--
-- Scope:
--   * communication_messages RLS only
--   * no telephony, billing, Gmail/PubSub, SMS provider, entitlement, auth,
--     conversation-threading, or background-job behavior is changed.
--
-- Existing assignment-aware policies remain in place for agents and replies to
-- existing conversations. These two policies are additive and tenant-scoped.

begin;

-- Management roles are defined by Flowtix as having organization-wide
-- Conversations visibility. This also makes INSERT ... RETURNING deterministic
-- for newly-threaded messages while preserving organization isolation.
drop policy if exists communication_messages_select_management_access
  on public.communication_messages;

create policy communication_messages_select_management_access
on public.communication_messages
for select to authenticated
using (
  public.is_organization_member(organization_id)
  and public.organization_role(organization_id) in ('owner', 'admin', 'manager')
);

-- New-message compose is intentionally narrower than the historical broad
-- tenant INSERT policy: it is limited to manual, queued, outbound Email/SMS
-- created by the signed-in owner/admin/manager in their own organization.
-- Agent replies continue to use communication_messages_insert_member and its
-- assignment-aware conversation check.
drop policy if exists communication_messages_insert_management_manual
  on public.communication_messages;

create policy communication_messages_insert_management_manual
on public.communication_messages
for insert to authenticated
with check (
  public.is_organization_member(organization_id)
  and public.organization_role(organization_id) in ('owner', 'admin', 'manager')
  and sent_by = auth.uid()
  and direction = 'outbound'
  and channel in ('email', 'sms')
  and source = 'manual'
  and status = 'queued'
);

commit;
