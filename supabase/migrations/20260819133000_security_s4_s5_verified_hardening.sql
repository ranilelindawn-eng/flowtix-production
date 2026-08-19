begin;

-- Trigger functions are not API endpoints. Revoke direct invocation without
-- changing the triggers that already execute them inside PostgreSQL.
revoke all on function public.capture_enterprise_contact_inquiry() from public, anon, authenticated;
revoke all on function public.mark_flowtix_trial_converted() from public, anon, authenticated;

-- Resolve current Security Advisor search_path warnings without changing
-- function bodies or their callers.
alter function public.set_sequence_execution_updated_at() set search_path = public, pg_catalog;
alter function public.set_sequence_enrollment_updated_at() set search_path = public, pg_catalog;
alter function public.get_todays_calls() set search_path = public, pg_catalog;
alter function public.get_campaign_count() set search_path = public, pg_catalog;
alter function public.get_average_call_duration() set search_path = public, pg_catalog;
alter function public.set_campaign_member_attempt_updated_at() set search_path = public, pg_catalog;
alter function public.normalize_tag_slug(text) set search_path = public, pg_catalog;
alter function public.get_total_calls() set search_path = public, pg_catalog;
alter function public.get_total_contacts() set search_path = public, pg_catalog;
alter function public.set_background_job_updated_at() set search_path = public, pg_catalog;
alter function public.touch_attachment_updated_at() set search_path = public, pg_catalog;

-- Invitation creation is the only normal path that needs to see a newly
-- generated invitation token. The function re-checks manager/owner authority
-- inside the SECURITY DEFINER boundary, then returns only that newly created
-- token to the authorized caller.
create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns table (
  id uuid,
  token uuid
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if not public.can_manage_organization_team(p_organization_id) then
    raise exception 'Organization team management permission required';
  end if;

  if p_role = 'owner'::public.member_role
     and not public.is_org_owner(p_organization_id) then
    raise exception 'Only an organization owner can invite another owner';
  end if;

  return query
  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    invited_by,
    expires_at
  )
  values (
    p_organization_id,
    v_email,
    p_role,
    auth.uid(),
    greatest(p_expires_at, now() + interval '5 minutes')
  )
  returning organization_invitations.id, organization_invitations.token;
end;
$$;

revoke all on function public.create_organization_invitation(uuid, text, public.member_role, timestamptz)
from public, anon;
grant execute on function public.create_organization_invitation(uuid, text, public.member_role, timestamptz)
to authenticated;

-- Normal organization members may continue to list pending invitation metadata,
-- but raw bearer tokens are no longer readable through PostgREST table SELECT.
revoke select on table public.organization_invitations from authenticated;
grant select (
  id,
  organization_id,
  email,
  role,
  invited_by,
  accepted_by,
  expires_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
) on table public.organization_invitations to authenticated;

grant all on table public.organization_invitations to service_role;

-- Keep the intentionally public preview function narrow: it reveals only the
-- email, role and organization name for a valid unexpired bearer token. The raw
-- token itself is never returned.
revoke all on function public.get_organization_invitation_preview(uuid) from public;
grant execute on function public.get_organization_invitation_preview(uuid) to anon, authenticated;

commit;
