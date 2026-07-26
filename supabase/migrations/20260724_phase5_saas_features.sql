-- CallFlow Phase 5: SaaS billing, usage limits, and tenant-isolation hardening
-- Run after the Phase 4 migration.

create extension if not exists pgcrypto;

-- Expand plan identifiers while keeping the Phase 4 free/business rows compatible.
alter table public.subscription_plans drop constraint if exists subscription_plans_code_check;
alter table public.subscription_plans
  add constraint subscription_plans_code_check
  check (code in ('free','starter','pro','business','enterprise'));

alter table public.subscription_plans
  add column if not exists max_storage_bytes bigint,
  add column if not exists max_calls_per_month integer,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_public boolean not null default true;

-- Starter is the launch entry tier requested for CallFlow.
insert into public.subscription_plans
  (code, name, description, monthly_price_cents, stripe_price_id, max_members, max_contacts, max_storage_bytes, max_calls_per_month, sort_order, is_public, features)
values
  ('starter', 'Starter', 'For individuals and small teams getting started.', 1900,
   nullif(current_setting('app.stripe_starter_price_id', true), ''),
   2, 500, 1073741824, 500, 10, true,
   '["2 team members", "500 contacts", "1 GB private storage", "500 calls per month", "Core CRM"]'::jsonb),
  ('pro', 'Pro', 'For growing sales teams.', 2900,
   coalesce(nullif(current_setting('app.stripe_pro_price_id', true), ''), (select stripe_price_id from public.subscription_plans where code = 'pro')),
   10, null, 26843545600, 5000, 20, true,
   '["10 team members", "Unlimited contacts", "25 GB private storage", "5,000 calls per month", "Cloud dialer", "AI summaries"]'::jsonb),
  ('enterprise', 'Enterprise', 'Unlimited scale with custom security and support.', 0, null,
   null, null, null, null, 30, true,
   '["Unlimited team members", "Unlimited contacts", "Unlimited storage", "Unlimited calls", "Enterprise controls", "Dedicated support"]'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  max_members = excluded.max_members,
  max_contacts = excluded.max_contacts,
  max_storage_bytes = excluded.max_storage_bytes,
  max_calls_per_month = excluded.max_calls_per_month,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  features = excluded.features,
  updated_at = now();

-- Keep the old Free plan for existing workspaces but hide it from new plan selection.
update public.subscription_plans set is_public = false, sort_order = 0 where code = 'free';
update public.subscription_plans set is_public = false where code = 'business';

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_event_id text unique,
  event_type text not null,
  stripe_subscription_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists subscription_events_org_idx
  on public.subscription_events (organization_id, processed_at desc);

alter table public.subscription_events enable row level security;
drop policy if exists subscription_events_read_admins on public.subscription_events;
create policy subscription_events_read_admins on public.subscription_events
for select to authenticated
using (public.organization_role(organization_id) in ('owner','admin'));

-- Resolve the active plan and limits for an organization.
create or replace function public.organization_plan_limits(target_org uuid)
returns table (
  plan_code text,
  plan_name text,
  max_members integer,
  max_contacts integer,
  max_storage_bytes bigint,
  max_calls_per_month integer,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.code,
    p.name,
    p.max_members,
    p.max_contacts,
    p.max_storage_bytes,
    p.max_calls_per_month,
    s.status,
    s.current_period_end,
    s.cancel_at_period_end
  from public.organization_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = target_org
  limit 1;
$$;

grant execute on function public.organization_plan_limits(uuid) to authenticated;

create or replace function public.organization_usage(target_org uuid)
returns table (
  members_count bigint,
  pending_invitations_count bigint,
  contacts_count bigint,
  calls_this_month bigint,
  storage_bytes bigint
)
language sql stable security definer set search_path = public, storage
as $$
  select
    (select count(*) from public.organization_members m where m.organization_id = target_org and m.status = 'active'),
    (select count(*) from public.organization_invitations i where i.organization_id = target_org and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
    (select count(*) from public.contacts c where c.organization_id = target_org),
    (select count(*) from public.calls c where c.organization_id = target_org and c.created_at >= date_trunc('month', now())),
    coalesce((select sum(a.size_bytes) from public.attachments a where a.organization_id = target_org), 0);
$$;

grant execute on function public.organization_usage(uuid) to authenticated;

create or replace function public.enforce_contact_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare limit_value integer; current_value bigint;
begin
  select p.max_contacts into limit_value
  from public.organization_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id;
  if limit_value is null then return new; end if;
  select count(*) into current_value from public.contacts where organization_id = new.organization_id;
  if current_value >= limit_value then
    raise exception 'CONTACT_LIMIT_REACHED: Your current plan allows % contacts.', limit_value using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_contact_limit_trigger on public.contacts;
create trigger enforce_contact_limit_trigger before insert on public.contacts
for each row execute function public.enforce_contact_limit();

create or replace function public.enforce_member_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare limit_value integer; current_value bigint;
begin
  if new.status <> 'active' then return new; end if;
  select p.max_members into limit_value
  from public.organization_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id;
  if limit_value is null then return new; end if;
  select count(*) into current_value from public.organization_members
    where organization_id = new.organization_id and status = 'active';
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  if current_value >= limit_value then
    raise exception 'MEMBER_LIMIT_REACHED: Your current plan allows % active members.', limit_value using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_member_limit_trigger on public.organization_members;
create trigger enforce_member_limit_trigger before insert or update on public.organization_members
for each row execute function public.enforce_member_limit();

create or replace function public.enforce_invitation_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare limit_value integer; used_value bigint;
begin
  select p.max_members into limit_value
  from public.organization_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id;
  if limit_value is null then return new; end if;
  select
    (select count(*) from public.organization_members where organization_id = new.organization_id and status = 'active') +
    (select count(*) from public.organization_invitations where organization_id = new.organization_id and accepted_at is null and revoked_at is null and expires_at > now())
  into used_value;
  if used_value >= limit_value then
    raise exception 'MEMBER_LIMIT_REACHED: Revoke a pending invitation or upgrade your plan.', using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_invitation_limit_trigger on public.organization_invitations;
create trigger enforce_invitation_limit_trigger before insert on public.organization_invitations
for each row execute function public.enforce_invitation_limit();

create or replace function public.enforce_call_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare limit_value integer; current_value bigint;
begin
  select p.max_calls_per_month into limit_value
  from public.organization_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id;
  if limit_value is null then return new; end if;
  select count(*) into current_value from public.calls
    where organization_id = new.organization_id and created_at >= date_trunc('month', now());
  if current_value >= limit_value then
    raise exception 'CALL_LIMIT_REACHED: Your monthly call allowance has been reached.', using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_call_limit_trigger on public.calls;
create trigger enforce_call_limit_trigger before insert on public.calls
for each row execute function public.enforce_call_limit();

create or replace function public.enforce_attachment_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare limit_value bigint; current_value bigint;
begin
  select p.max_storage_bytes into limit_value
  from public.organization_subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id;
  if limit_value is null then return new; end if;
  select coalesce(sum(size_bytes), 0) into current_value from public.attachments where organization_id = new.organization_id;
  if current_value + coalesce(new.size_bytes, 0) > limit_value then
    raise exception 'STORAGE_LIMIT_REACHED: Upgrade your plan or remove files.', using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_attachment_limit_trigger on public.attachments;
create trigger enforce_attachment_limit_trigger before insert on public.attachments
for each row execute function public.enforce_attachment_limit();

-- Explicit tenant policies for core subscriber data. These replace any older broad policies.
do $$
declare t text;
begin
  foreach t in array array['contacts','calls','contact_notes','contact_tasks','notes','attachments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_phase5_tenant', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id))',
        t || '_phase5_tenant', t
      );
    end if;
  end loop;
end $$;

-- Private storage paths must start with the organization UUID.
drop policy if exists crm_attachments_read on storage.objects;
create policy crm_attachments_read on storage.objects for select to authenticated
using (bucket_id = 'crm-attachments' and public.is_organization_member((storage.foldername(name))[1]::uuid));

drop policy if exists crm_attachments_insert on storage.objects;
create policy crm_attachments_insert on storage.objects for insert to authenticated
with check (bucket_id = 'crm-attachments' and public.is_organization_member((storage.foldername(name))[1]::uuid));

drop policy if exists crm_attachments_update on storage.objects;
create policy crm_attachments_update on storage.objects for update to authenticated
using (bucket_id = 'crm-attachments' and public.is_organization_member((storage.foldername(name))[1]::uuid))
with check (bucket_id = 'crm-attachments' and public.is_organization_member((storage.foldername(name))[1]::uuid));

drop policy if exists crm_attachments_delete on storage.objects;
create policy crm_attachments_delete on storage.objects for delete to authenticated
using (bucket_id = 'crm-attachments' and public.is_organization_member((storage.foldername(name))[1]::uuid));
