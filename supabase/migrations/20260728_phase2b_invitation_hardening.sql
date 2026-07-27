-- CallFlow Phase 2B: invitation-flow hardening
-- Run after 20260728_phase2a_active_organization.sql.

-- Expired, unaccepted invitations should no longer block a replacement invite
-- for the same organization and email address.
update public.organization_invitations
set
  revoked_at = coalesce(revoked_at, now()),
  updated_at = now()
where accepted_at is null
  and revoked_at is null
  and expires_at <= now();

-- Keep acceptance atomic and ensure the active organization is selected only
-- after the membership and profile have both been validated.
create or replace function public.accept_organization_invitation(
  invitation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_record public.organization_invitations%rowtype;
  signed_in_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select lower(email)
  into signed_in_email
  from auth.users
  where id = auth.uid();

  if signed_in_email is null then
    raise exception 'Authenticated user email not found';
  end if;

  select *
  into invitation_record
  from public.organization_invitations
  where token = invitation_token
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation unavailable';
  end if;

  if invitation_record.accepted_at is not null then
    raise exception 'Invitation already accepted';
  end if;

  if invitation_record.revoked_at is not null then
    raise exception 'Invitation revoked';
  end if;

  if invitation_record.expires_at <= now() then
    update public.organization_invitations
    set revoked_at = now(), updated_at = now()
    where id = invitation_record.id;

    raise exception 'Invitation expired';
  end if;

  if lower(invitation_record.email) <> signed_in_email then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    invitation_record.organization_id,
    auth.uid(),
    invitation_record.role,
    'active'
  )
  on conflict (organization_id, user_id)
  do update set
    status = 'active',
    updated_at = now();

  update public.profiles
  set
    organization_id = invitation_record.organization_id,
    updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'User profile not found';
  end if;

  update public.organization_invitations
  set
    accepted_by = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where id = invitation_record.id
    and accepted_at is null
    and revoked_at is null;

  if not found then
    raise exception 'Invitation was already processed';
  end if;

  return true;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
