begin;

-- Flowtix-managed telephony: subscribers can view assigned numbers and operate
-- routing, but carrier connections and number provisioning are platform-only.

-- Carrier integration records are not subscriber-managed.
drop policy if exists "admins manage integrations" on public.organization_integrations;
create policy "admins manage workspace integrations"
  on public.organization_integrations
  for all
  using (
    public.organization_role(organization_id) in ('owner','admin')
    and provider <> 'signalwire'
  )
  with check (
    public.organization_role(organization_id) in ('owner','admin')
    and provider <> 'signalwire'
  );

-- Assigned phone numbers are readable by workspace members but mutations are
-- performed through tightly-scoped RPCs or service-role platform operations.
drop policy if exists "admins manage phone numbers" on public.organization_phone_numbers;
revoke insert, update, delete on public.organization_phone_numbers from authenticated;
grant select on public.organization_phone_numbers to authenticated;
grant all on public.organization_phone_numbers to service_role;

create or replace function public.set_workspace_default_phone_number(
  target_organization uuid,
  target_phone_number uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
begin
  if public.organization_role(target_organization) not in ('owner','admin') then
    raise exception 'OWNER_OR_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_phone_numbers p
    where p.id = target_phone_number
      and p.organization_id = target_organization
      and p.provider = 'signalwire'
  ) then
    raise exception 'PHONE_NUMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.organization_phone_numbers
  set is_default = false,
      updated_at = now()
  where organization_id = target_organization
    and is_default = true;

  update public.organization_phone_numbers
  set is_default = true,
      updated_at = now()
  where id = target_phone_number
    and organization_id = target_organization;

  return true;
end;
$function$;

revoke all on function public.set_workspace_default_phone_number(uuid, uuid)
from public, anon;
grant execute on function public.set_workspace_default_phone_number(uuid, uuid)
to authenticated, service_role;

-- All live telephony rows are constrained to the platform carrier. Existing
-- historical rows were retired by the previous migration before this constraint.
alter table public.organization_phone_numbers
  drop constraint if exists organization_phone_numbers_provider_check,
  add constraint organization_phone_numbers_provider_check
    check (provider = 'signalwire') not valid;

alter table public.phone_numbers
  drop constraint if exists phone_numbers_provider_check,
  add constraint phone_numbers_provider_check
    check (provider = 'signalwire') not valid;

commit;
