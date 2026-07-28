-- CallFlow Phase 6 corrected migration
-- Exact organization roles + invitation workspace repair.
-- IMPORTANT: enum additions must be committed before the new values are used.

-- ============================================================
-- PART 1: add enum values outside an explicit transaction
-- ============================================================

alter type public.member_role add value if not exists 'manager';
alter type public.member_role add value if not exists 'supervisor';
alter type public.member_role add value if not exists 'agent';

-- ============================================================
-- PART 2: use the committed enum values
-- ============================================================

begin;

-- Remove any previous broken cleanup trigger/function from the earlier patch.
drop trigger if exists zzz_cleanup_invited_user_workspace on auth.users;
drop function if exists public.cleanup_invited_user_personal_workspace();

-- Align invitation roles with the CallFlow permission model.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.organization_invitations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format(
      'alter table public.organization_invitations drop constraint %I',
      constraint_record.conname
    );
  end loop;
end;
$$;

alter table public.organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('owner', 'admin', 'manager', 'supervisor', 'agent'));

-- Keep the organization_members constraint aligned as well.
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in (
    'owner'::public.member_role,
    'admin'::public.member_role,
    'manager'::public.member_role,
    'supervisor'::public.member_role,
    'agent'::public.member_role
  ));

-- Invitation acceptance is authoritative for exact role and active workspace.
-- Normal signup may create a temporary personal workspace. Once an invitation
-- is accepted, this function switches the profile to the inviter workspace,
-- stores the exact invited role, then removes the temporary personal workspace.
create or replace function public.accept_organization_invitation(
  invitation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  invitation_record public.organization_invitations%rowtype;
  signed_in_email text;
  exact_role public.member_role;
  personal_organization_id uuid;
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

  exact_role := invitation_record.role::public.member_role;

  -- Capture the auto-created personal workspace before switching profiles.
  select om.organization_id
  into personal_organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.role = 'owner'::public.member_role
    and om.organization_id <> invitation_record.organization_id
  order by om.created_at asc
  limit 1;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    created_by
  )
  values (
    invitation_record.organization_id,
    auth.uid(),
    exact_role,
    'active',
    invitation_record.invited_by
  )
  on conflict (organization_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    updated_at = now();

  update public.profiles
  set
    organization_id = invitation_record.organization_id,
    role = case
      when exact_role = 'owner'::public.member_role
        then 'owner'::public.profile_role
      when exact_role = 'admin'::public.member_role
        then 'admin'::public.profile_role
      else 'member'::public.profile_role
    end,
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

  -- The profile now points to the invited organization, so the temporary
  -- personal workspace can be safely removed.
  if personal_organization_id is not null then
    delete from public.organization_members
    where organization_id = personal_organization_id
      and user_id = auth.uid();

    delete from public.organizations o
    where o.id = personal_organization_id
      and o.created_by = auth.uid()
      and not exists (
        select 1
        from public.organization_members remaining
        where remaining.organization_id = o.id
      );
  end if;

  return true;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;

-- Repair already accepted invitations and restore exact roles.
update public.organization_members om
set
  role = oi.role::public.member_role,
  status = 'active',
  created_by = coalesce(om.created_by, oi.invited_by),
  updated_at = now()
from public.organization_invitations oi
where oi.accepted_by = om.user_id
  and oi.organization_id = om.organization_id
  and oi.accepted_at is not null
  and oi.revoked_at is null;

-- Make the most recently accepted invited workspace active.
update public.profiles p
set
  organization_id = accepted.organization_id,
  role = case
    when accepted.role = 'owner'
      then 'owner'::public.profile_role
    when accepted.role = 'admin'
      then 'admin'::public.profile_role
    else 'member'::public.profile_role
  end,
  updated_at = now()
from lateral (
  select oi.organization_id, oi.role
  from public.organization_invitations oi
  where oi.accepted_by = p.id
    and oi.accepted_at is not null
    and oi.revoked_at is null
  order by oi.accepted_at desc
  limit 1
) accepted;

-- Remove accidental personal owner memberships for accepted invitees.
delete from public.organization_members om
using public.organization_invitations oi,
      public.organizations personal_org
where oi.accepted_by = om.user_id
  and oi.accepted_at is not null
  and oi.revoked_at is null
  and om.role = 'owner'::public.member_role
  and om.organization_id <> oi.organization_id
  and personal_org.id = om.organization_id
  and personal_org.created_by = om.user_id;

-- Remove now-empty accidental personal organizations.
delete from public.organizations o
where not exists (
  select 1
  from public.organization_members om
  where om.organization_id = o.id
)
and exists (
  select 1
  from public.organization_invitations oi
  where oi.accepted_by = o.created_by
    and oi.accepted_at is not null
    and oi.revoked_at is null
    and oi.organization_id <> o.id
);

notify pgrst, 'reload schema';

commit;
