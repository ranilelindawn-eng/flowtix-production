-- CallFlow Phase 4: organizations, team roles, invitations, billing, and plans
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  timezone text not null default 'UTC',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner','admin','manager','agent')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'agent' check (role in ('owner','admin','manager','agent')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists active_org_invitation_email_idx
on public.organization_invitations (organization_id, lower(email))
where accepted_at is null and revoked_at is null;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('free','pro','business','enterprise')),
  name text not null,
  description text,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  stripe_price_id text unique,
  max_members integer,
  max_contacts integer,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (code, name, description, monthly_price_cents, stripe_price_id, max_members, max_contacts, features)
values
  ('free', 'Free', 'Get started with the CallFlow CRM.', 0, null, 2, 500, '["2 team members", "500 contacts", "Core CRM", "Basic calling"]'::jsonb),
  ('pro', 'Pro', 'For growing sales teams.', 2900, nullif(current_setting('app.stripe_pro_price_id', true), ''), 10, null, '["10 team members", "Unlimited contacts", "Cloud dialer", "AI summaries", "Email and SMS"]'::jsonb),
  ('business', 'Business', 'Advanced controls for larger teams.', 7900, nullif(current_setting('app.stripe_business_price_id', true), ''), 50, null, '["50 team members", "Unlimited contacts", "Advanced roles", "Priority support", "Team analytics"]'::jsonb),
  ('enterprise', 'Enterprise', 'Custom limits, security, and support.', 0, null, null, null, '["Unlimited members", "Custom limits", "Dedicated support", "Enterprise controls"]'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  max_members = excluded.max_members,
  max_contacts = excluded.max_contacts,
  features = excluded.features,
  updated_at = now();

-- Set Stripe price IDs after running the migration:
-- update public.subscription_plans set stripe_price_id = 'price_...' where code = 'pro';
-- update public.subscription_plans set stripe_price_id = 'price_...' where code = 'business';

create or replace function public.is_organization_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.organization_role(target_org uuid)
returns text language sql stable security definer set search_path = public
as $$
  select role from public.organization_members
  where organization_id = target_org and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.accept_organization_invitation(invitation_token uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  invitation_record public.organization_invitations%rowtype;
  signed_in_email text;
begin
  select email into signed_in_email from auth.users where id = auth.uid();
  if signed_in_email is null then raise exception 'Authentication required'; end if;

  select * into invitation_record
  from public.organization_invitations
  where token = invitation_token
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if invitation_record.id is null then raise exception 'Invitation unavailable'; end if;
  if lower(invitation_record.email) <> lower(signed_in_email) then raise exception 'Invitation email does not match signed-in user'; end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invitation_record.organization_id, auth.uid(), invitation_record.role)
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();

  update public.organization_invitations
  set accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = invitation_record.id;

  return true;
end;
$$;

grant execute on function public.accept_organization_invitation(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.organization_subscriptions enable row level security;

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members on public.organizations for select to authenticated
using (public.is_organization_member(id));

drop policy if exists organizations_update_admins on public.organizations;
create policy organizations_update_admins on public.organizations for update to authenticated
using (public.organization_role(id) in ('owner','admin'))
with check (public.organization_role(id) in ('owner','admin'));

drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team on public.profiles for select to authenticated
using (id = auth.uid() or exists (
  select 1 from public.organization_members mine
  join public.organization_members theirs on theirs.organization_id = mine.organization_id
  where mine.user_id = auth.uid() and theirs.user_id = profiles.id and mine.status = 'active'
));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists members_select_org on public.organization_members;
create policy members_select_org on public.organization_members for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists members_manage_admins on public.organization_members;
create policy members_manage_admins on public.organization_members for all to authenticated
using (public.organization_role(organization_id) in ('owner','admin'))
with check (public.organization_role(organization_id) in ('owner','admin'));

drop policy if exists invitations_select_admins_or_invitee on public.organization_invitations;
create policy invitations_select_admins_or_invitee on public.organization_invitations for select to authenticated
using (public.organization_role(organization_id) in ('owner','admin') or lower(email) = lower(coalesce(auth.jwt()->>'email','')));

drop policy if exists invitations_manage_admins on public.organization_invitations;
create policy invitations_manage_admins on public.organization_invitations for all to authenticated
using (public.organization_role(organization_id) in ('owner','admin'))
with check (public.organization_role(organization_id) in ('owner','admin'));

drop policy if exists plans_public_read on public.subscription_plans;
create policy plans_public_read on public.subscription_plans for select to authenticated using (is_active = true);

drop policy if exists subscriptions_select_members on public.organization_subscriptions;
create policy subscriptions_select_members on public.organization_subscriptions for select to authenticated
using (public.is_organization_member(organization_id));

-- Subscription writes are performed only by the service-role Stripe webhook.

create or replace function public.bootstrap_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  free_plan_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;

  insert into public.organizations (name, slug, created_by)
  values (
    coalesce(new.raw_user_meta_data->>'organization_name', split_part(coalesce(new.email,'workspace'), '@', 1) || '''s Workspace'),
    lower(regexp_replace(split_part(coalesce(new.email, gen_random_uuid()::text), '@', 1), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 8),
    new.id
  ) returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, new.id, 'owner');

  select id into free_plan_id from public.subscription_plans where code = 'free';
  if free_plan_id is not null then
    insert into public.organization_subscriptions (organization_id, plan_id, status)
    values (org_id, free_plan_id, 'active')
    on conflict (organization_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_callflow on auth.users;
create trigger on_auth_user_created_callflow
after insert on auth.users for each row execute function public.bootstrap_new_user();
