-- Owner-paid workspace model and expanded operational roles.
-- Only the organization owner is responsible for the subscription.
-- Invited members do not consume paid seats.

drop trigger if exists enforce_member_limit_trigger on public.organization_members;
drop trigger if exists enforce_invitation_limit_trigger on public.organization_invitations;

alter table public.organization_members
  drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner','admin','manager','supervisor','agent'));

alter table public.organization_invitations
  drop constraint if exists organization_invitations_role_check;
alter table public.organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('owner','admin','manager','supervisor','agent'));

comment on table public.organization_members is
  'Workspace memberships. Billing belongs to the organization owner; invited members join without individual subscriptions.';
