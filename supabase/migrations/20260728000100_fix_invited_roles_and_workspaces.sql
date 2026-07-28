-- CallFlow Phase 6: invitation-aware workspaces and exact team roles
-- Run once in Supabase SQL Editor before deploying the source patch.

begin;

-- The dashboard permission model uses these exact organization roles.
alter type public.member_role add value if not exists 'manager';
alter type public.member_role add value if not exists 'supervisor';
alter type public.member_role add value if not exists 'agent';

-- Keep invitation roles aligned with the application role model.
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

-- The normal signup trigger currently creates a personal owner workspace for
-- every user. This final AFTER INSERT trigger removes that automatically-created
-- workspace only when signup came from an invitation. Its zzz_ prefix ensures it
-- runs after the existing signup trigger.
create or replace function public.cleanup_invited_user_personal_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  personal_organization_id uuid;
begin
  if coalesce((new.raw_user_meta_data ->> 'invited_user')::boolean, false) is not true then
    return new;
  end if;

  select om.organization_id
    into personal_organization_id
  from public.organization_members om
  where om.user_id = new.id
    and om.role = 'owner'::public.member_role
  order by om.created_at asc
  limit 1;

  if personal_organization_id is not null then
    delete from public.organization_members
    where organization_id = personal_organization_id
      and user_id = new.id;

    delete from public.organizations o
    where o.id = personal_organization_id
      and not exists (
        select 1
        from public.organization_members remaining
        where remaining.organization_id = o.id
      );
  end if;

  update public.profiles
  set organization_id = null,
      role = 'member'::public.profile_role,
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists zzz_cleanup_invited_user_workspace on auth.users;
create trigger zzz_cleanup_invited_user_workspace
after insert on auth.users
for each row
execute function public.cleanup_invited_user_personal_workspace();

-- Invitation acceptance is the authoritative place where membership role and
-- active organization are selected. profiles.role remains a legacy broad role;
-- all authorization must use organization_members.role.
create or replace function public.accept_organization_invitation(
  invitation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation_record public.organization_invitations%rowtype;
  signed_in_email text;
  exact_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select email
    into signed_in_email
  from auth.users
  where id = auth.uid();

  select *
    into invitation_record
  from public.organization_invitations
  where token = invitation_token
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation unavailable';
  end if;

  if lower(invitation_record.email) <> lower(signed_in_email) then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  exact_role := invitation_record.role::public.member_role;

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
  set organization_id = invitation_record.organization_id,
      role = case
        when exact_role = 'owner'::public.member_role then 'owner'::public.profile_role
        when exact_role = 'admin'::public.member_role then 'admin'::public.profile_role
        else 'member'::public.profile_role
      end,
      updated_at = now()
  where id = auth.uid();

  update public.organization_invitations
  set accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where id = invitation_record.id;

  return true;
end;
$$;

grant execute on function public.accept_organization_invitation(uuid) to authenticated;

-- Repair already-accepted invitations: restore the exact invitation role and
-- select the inviter's organization as active.
update public.organization_members om
set role = oi.role::public.member_role,
    status = 'active',
    updated_at = now()
from public.organization_invitations oi
where oi.accepted_by = om.user_id
  and oi.organization_id = om.organization_id
  and oi.accepted_at is not null
  and oi.revoked_at is null;

update public.profiles p
set organization_id = accepted.organization_id,
    role = case
      when accepted.role = 'owner' then 'owner'::public.profile_role
      when accepted.role = 'admin' then 'admin'::public.profile_role
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

-- Remove accidental personal owner workspaces for users who joined through an
-- accepted invitation. This is intentionally limited to organizations whose ID
-- equals the invited user's ID, matching CallFlow's automatic workspace pattern.
delete from public.organization_members om
using public.organization_invitations oi
where oi.accepted_by = om.user_id
  and oi.accepted_at is not null
  and om.role = 'owner'::public.member_role
  and om.organization_id = om.user_id
  and om.organization_id <> oi.organization_id;

delete from public.organizations o
where not exists (
  select 1 from public.organization_members om
  where om.organization_id = o.id
)
and exists (
  select 1 from auth.users u
  join public.organization_invitations oi on oi.accepted_by = u.id
  where u.id = o.id
    and oi.accepted_at is not null
);

notify pgrst, 'reload schema';

commit;
