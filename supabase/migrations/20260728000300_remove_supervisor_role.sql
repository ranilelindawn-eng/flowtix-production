-- CallFlow role model alignment: Owner, Admin, Manager, Agent only.
-- Existing supervisor assignments are promoted to Manager.

begin;

update public.organization_members
set role = 'manager'::public.member_role,
    updated_at = now()
where role::text = 'supervisor';

update public.organization_invitations
set role = 'manager',
    updated_at = now()
where lower(role::text) = 'supervisor';

-- Replace any role check so new invitations only accept the four dashboard roles.
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
  check (role in ('owner', 'admin', 'manager', 'agent'));

notify pgrst, 'reload schema';

commit;
