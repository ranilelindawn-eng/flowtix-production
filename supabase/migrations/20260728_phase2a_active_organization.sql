-- CallFlow Phase 2A: reliable active-organization selection.
-- Additive migration. It preserves all organizations, memberships, and CRM data.

alter table public.profiles
  add column if not exists organization_id uuid;

-- Normalize the foreign key without requiring a destructive table rebuild.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_organization_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id);

-- Backfill an active workspace for existing users. Prefer their oldest owned
-- workspace, then their oldest active membership.
with ranked_memberships as (
  select
    member.user_id,
    member.organization_id,
    row_number() over (
      partition by member.user_id
      order by
        case when member.role = 'owner' then 0 else 1 end,
        member.created_at asc,
        member.organization_id asc
    ) as membership_rank
  from public.organization_members member
  where member.status = 'active'
)
update public.profiles profile
set
  organization_id = ranked.organization_id,
  updated_at = now()
from ranked_memberships ranked
where ranked.user_id = profile.id
  and ranked.membership_rank = 1
  and (
    profile.organization_id is null
    or not exists (
      select 1
      from public.organization_members active_member
      where active_member.user_id = profile.id
        and active_member.organization_id = profile.organization_id
        and active_member.status = 'active'
    )
  );

create or replace function public.set_active_organization(
  target_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.organization_id = target_organization_id
      and member.status = 'active'
  ) then
    raise exception 'You are not an active member of this organization';
  end if;

  update public.profiles
  set
    organization_id = target_organization_id,
    updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'User profile not found';
  end if;

  return true;
end;
$$;

revoke all on function public.set_active_organization(uuid) from public;
grant execute on function public.set_active_organization(uuid) to authenticated;

-- Keep invitation acceptance atomic: membership creation, invitation update,
-- and active-workspace selection either all succeed or all roll back.
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
  select email
  into signed_in_email
  from auth.users
  where id = auth.uid();

  if signed_in_email is null then
    raise exception 'Authentication required';
  end if;

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
    role = excluded.role,
    status = 'active',
    updated_at = now();

  update public.profiles
  set
    organization_id = invitation_record.organization_id,
    updated_at = now()
  where id = auth.uid();

  update public.organization_invitations
  set
    accepted_by = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where id = invitation_record.id;

  return true;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
