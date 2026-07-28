-- CallFlow: invitation signup preview and resilient acceptance.

create or replace function public.get_organization_invitation_preview(
  invitation_token uuid
)
returns table (
  email text,
  role text,
  organization_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(i.email),
    i.role::text,
    o.name
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = invitation_token
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_organization_invitation_preview(uuid) from public;
grant execute on function public.get_organization_invitation_preview(uuid) to anon, authenticated;

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
  signed_in_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select lower(email), coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
  into signed_in_email, signed_in_name
  from auth.users
  where id = auth.uid();

  if signed_in_email is null then
    raise exception 'Authenticated user email not found';
  end if;

  select * into invitation_record
  from public.organization_invitations
  where token = invitation_token
  for update;

  if invitation_record.id is null then raise exception 'Invitation unavailable'; end if;
  if invitation_record.accepted_at is not null then raise exception 'Invitation already accepted'; end if;
  if invitation_record.revoked_at is not null then raise exception 'Invitation revoked'; end if;
  if invitation_record.expires_at <= now() then raise exception 'Invitation expired'; end if;
  if lower(invitation_record.email) <> signed_in_email then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  -- Ensure the profile exists before the membership FK is evaluated.
  insert into public.profiles (id, email, full_name)
  values (auth.uid(), signed_in_email, signed_in_name)
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status
  ) values (
    invitation_record.organization_id,
    auth.uid(),
    invitation_record.role,
    'active'
  )
  on conflict (organization_id, user_id) do update set
    status = 'active',
    updated_at = now();

  update public.profiles
  set organization_id = invitation_record.organization_id,
      updated_at = now()
  where id = auth.uid();

  update public.organization_invitations
  set accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where id = invitation_record.id
    and accepted_at is null
    and revoked_at is null;

  if not found then raise exception 'Invitation was already processed'; end if;

  return true;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;

notify pgrst, 'reload schema';
