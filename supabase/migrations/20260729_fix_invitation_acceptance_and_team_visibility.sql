begin;

-- Return the signed-in user's complete active organization roster without
-- depending on nested client-side RLS joins. The function remains tenant-safe
-- because it derives the organization only from auth.uid().
create or replace function public.get_current_organization_team_members()
returns table (
  id uuid,
  organization_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  full_name text,
  email text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  with current_membership as (
    select membership.organization_id
    from public.organization_members as membership
    left join public.profiles as profile
      on profile.id = auth.uid()
    where membership.user_id = auth.uid()
      and coalesce(membership.status, 'active') = 'active'
    order by
      case
        when membership.organization_id = profile.organization_id then 0
        else 1
      end,
      membership.created_at asc
    limit 1
  )
  select
    membership.id,
    membership.organization_id,
    membership.user_id,
    membership.role::text,
    membership.created_at,
    profile.full_name,
    coalesce(profile.email, account.email) as email,
    profile.avatar_url
  from public.organization_members as membership
  join current_membership
    on current_membership.organization_id = membership.organization_id
  left join public.profiles as profile
    on profile.id = membership.user_id
  left join auth.users as account
    on account.id = membership.user_id
  where coalesce(membership.status, 'active') = 'active'
    and membership.role in ('owner', 'admin', 'manager', 'agent')
  order by membership.created_at asc;
$$;

revoke all
on function public.get_current_organization_team_members()
from public;

grant execute
on function public.get_current_organization_team_members()
to authenticated, service_role;

-- Accept an invitation atomically, preserving the invited role and satisfying
-- legacy required ownership columns used by the existing CallFlow schema.
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
  signed_in_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    lower(account.email),
    coalesce(
      nullif(trim(account.raw_user_meta_data ->> 'full_name'), ''),
      split_part(account.email, '@', 1)
    )
  into signed_in_email, signed_in_name
  from auth.users as account
  where account.id = auth.uid();

  if signed_in_email is null then
    raise exception 'Authenticated user email not found';
  end if;

  select invitation.*
  into invitation_record
  from public.organization_invitations as invitation
  where invitation.token = invitation_token
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

  insert into public.profiles (
    id,
    email,
    full_name,
    organization_id,
    created_by,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    signed_in_email,
    signed_in_name,
    invitation_record.organization_id,
    auth.uid(),
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    organization_id = excluded.organization_id,
    created_by = coalesce(public.profiles.created_by, excluded.created_by),
    updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    invitation_record.organization_id,
    auth.uid(),
    invitation_record.role,
    'active',
    invitation_record.invited_by,
    now(),
    now()
  )
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    status = 'active',
    created_by = coalesce(
      public.organization_members.created_by,
      excluded.created_by
    ),
    updated_at = now();

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

revoke all
on function public.accept_organization_invitation(uuid)
from public;

grant execute
on function public.accept_organization_invitation(uuid)
to authenticated, service_role;

commit;

select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'accept_organization_invitation',
    'get_current_organization_team_members'
  )
order by routine_name;
