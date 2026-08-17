begin;

-- ============================================================
-- Flowtix Enterprise assisted onboarding
--
-- Adds a Platform Admin-managed Enterprise sales/onboarding record,
-- custom per-organization limits, custom PayMongo checkout tracking,
-- manual paid activation, suspension/reactivation, and read-only
-- Platform directory/detail RPCs.
--
-- Starter / Professional / Business self-service billing remains unchanged.
-- Enterprise checkout payment never auto-activates the workspace: a verified
-- paid record plus an explicit Platform "Activate Enterprise" action is required.
-- ============================================================

create table if not exists public.enterprise_accounts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid unique references public.contact_inquiries(id) on delete set null,
  organization_id uuid unique references public.organizations(id) on delete set null,

  contact_name text not null,
  contact_email text not null,
  company_name text,

  onboarding_status text not null default 'inquiry',
  proposed_monthly_price_cents integer,
  currency text not null default 'PHP',

  custom_member_limit integer,
  custom_contact_limit integer,
  custom_active_campaign_limit integer,
  custom_active_sequence_limit integer,
  custom_storage_bytes bigint,
  custom_recording_retention_days integer,
  custom_ai_requests_per_month integer,
  custom_transcription_minutes_per_month integer,

  contract_reference_notes text,

  payment_status text not null default 'not_started',
  paymongo_checkout_id text unique,
  paymongo_checkout_url text,
  paymongo_payment_id text,
  last_applied_payment_id text,
  checkout_expires_at timestamptz,
  payment_amount_cents integer,
  paid_at timestamptz,

  checkout_creation_token uuid,
  checkout_creation_started_at timestamptz,

  activated_at timestamptz,
  suspended_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint enterprise_accounts_email_check
    check (length(pg_catalog.btrim(contact_email)) between 3 and 254),
  constraint enterprise_accounts_currency_check
    check (currency = 'PHP'),
  constraint enterprise_accounts_status_check
    check (onboarding_status in (
      'inquiry',
      'qualified',
      'proposal',
      'awaiting_payment',
      'payment_confirmed',
      'onboarding',
      'ready',
      'active',
      'suspended',
      'closed'
    )),
  constraint enterprise_accounts_payment_status_check
    check (payment_status in (
      'not_started',
      'pending',
      'paid',
      'failed',
      'expired',
      'refunded',
      'partially_refunded'
    )),
  constraint enterprise_accounts_price_check
    check (
      proposed_monthly_price_cents is null
      or proposed_monthly_price_cents > 0
    ),
  constraint enterprise_accounts_limits_check
    check (
      (custom_member_limit is null or custom_member_limit >= 0)
      and (custom_contact_limit is null or custom_contact_limit >= 0)
      and (custom_active_campaign_limit is null or custom_active_campaign_limit >= 0)
      and (custom_active_sequence_limit is null or custom_active_sequence_limit >= 0)
      and (custom_storage_bytes is null or custom_storage_bytes >= 0)
      and (custom_recording_retention_days is null or custom_recording_retention_days >= 0)
      and (custom_ai_requests_per_month is null or custom_ai_requests_per_month >= 0)
      and (custom_transcription_minutes_per_month is null or custom_transcription_minutes_per_month >= 0)
    )
);

create index if not exists enterprise_accounts_status_created_idx
  on public.enterprise_accounts(onboarding_status, created_at desc);

create index if not exists enterprise_accounts_payment_status_idx
  on public.enterprise_accounts(payment_status, updated_at desc);

create index if not exists enterprise_accounts_email_idx
  on public.enterprise_accounts(lower(contact_email));

alter table public.enterprise_accounts enable row level security;
revoke all on table public.enterprise_accounts from public, anon, authenticated;
grant all on table public.enterprise_accounts to service_role;

comment on table public.enterprise_accounts is
  'Internal Flowtix Enterprise inquiry, proposal, custom-capacity, PayMongo payment, onboarding, activation and suspension record. Customer workspace access is never granted directly to this table.';

-- ------------------------------------------------------------
-- Automatically capture public "Enterprise plan" inquiries.
-- ------------------------------------------------------------

create or replace function public.capture_enterprise_contact_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.topic = 'Enterprise plan' then
    insert into public.enterprise_accounts (
      inquiry_id,
      contact_name,
      contact_email,
      onboarding_status
    )
    values (
      new.id,
      new.name,
      lower(new.email),
      'inquiry'
    )
    on conflict (inquiry_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists contact_inquiries_capture_enterprise
  on public.contact_inquiries;

create trigger contact_inquiries_capture_enterprise
after insert on public.contact_inquiries
for each row
execute function public.capture_enterprise_contact_inquiry();

insert into public.enterprise_accounts (
  inquiry_id,
  contact_name,
  contact_email,
  onboarding_status,
  created_at,
  updated_at
)
select
  inquiry.id,
  inquiry.name,
  lower(inquiry.email),
  'inquiry',
  inquiry.created_at,
  inquiry.created_at
from public.contact_inquiries inquiry
where inquiry.topic = 'Enterprise plan'
on conflict (inquiry_id) do nothing;

-- Preserve and surface any Enterprise subscriptions that existed before this
-- assisted-onboarding workflow. Their current access is not changed. Missing
-- negotiated limits remain NULL until Platform Admin configures them.
insert into public.enterprise_accounts (
  organization_id,
  contact_name,
  contact_email,
  company_name,
  onboarding_status,
  proposed_monthly_price_cents,
  payment_status,
  paymongo_checkout_id,
  paymongo_payment_id,
  last_applied_payment_id,
  payment_amount_cents,
  activated_at,
  created_at,
  updated_at
)
select
  organization.id,
  coalesce(
    nullif(pg_catalog.btrim(profile.full_name), ''),
    split_part(owner_account.email, '@', 1),
    organization.name
  ),
  coalesce(owner_account.email, 'enterprise-' || organization.id::text || '@invalid.local'),
  organization.name,
  case
    when subscription.status = 'suspended' then 'suspended'
    when subscription.status in ('cancelled', 'canceled') then 'closed'
    else 'active'
  end,
  case
    when jsonb_typeof(subscription.billing_metadata -> 'enterprise_monthly_price_cents') = 'number'
      then (subscription.billing_metadata ->> 'enterprise_monthly_price_cents')::integer
    else plan.monthly_price_cents
  end,
  case
    when subscription.last_payment_status = 'paid'
      and subscription.paymongo_payment_id is not null then 'paid'
    when subscription.last_payment_status = 'pending' then 'pending'
    else 'not_started'
  end,
  subscription.paymongo_checkout_id,
  subscription.paymongo_payment_id,
  case
    when subscription.status in ('active', 'past_due', 'suspended')
      then subscription.paymongo_payment_id
    else null
  end,
  case
    when subscription.last_payment_status = 'paid'
      then coalesce(
        case
          when jsonb_typeof(subscription.billing_metadata -> 'enterprise_monthly_price_cents') = 'number'
            then (subscription.billing_metadata ->> 'enterprise_monthly_price_cents')::integer
          else null
        end,
        plan.monthly_price_cents
      )
    else null
  end,
  subscription.activated_at,
  coalesce(subscription.activated_at, organization.created_at, pg_catalog.now()),
  pg_catalog.now()
from public.organization_subscriptions subscription
join public.subscription_plans plan
  on plan.id = subscription.plan_id
 and plan.code = 'enterprise'
join public.organizations organization
  on organization.id = subscription.organization_id
left join lateral (
  select member.user_id
  from public.organization_members member
  where member.organization_id = organization.id
    and member.role = 'owner'
    and member.status = 'active'
  order by member.created_at
  limit 1
) owner_member on true
left join auth.users owner_account
  on owner_account.id = coalesce(owner_member.user_id, organization.created_by)
left join public.profiles profile
  on profile.id = coalesce(owner_member.user_id, organization.created_by)
on conflict (organization_id) do nothing;

-- ------------------------------------------------------------
-- Platform access helpers.
-- ------------------------------------------------------------

create or replace function public.platform_enterprise_actor()
returns public.platform_users
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
begin
  select platform_user.*
  into actor
  from public.platform_users platform_user
  where platform_user.user_id = auth.uid()
    and platform_user.is_active = true
    and platform_user.role in (
      'platform_owner',
      'platform_admin',
      'finance'
    )
  limit 1;

  if actor.id is null then
    raise exception 'Platform Enterprise management permission required.'
      using errcode = '42501';
  end if;

  return actor;
end;
$$;

revoke all on function public.platform_enterprise_actor()
  from public, anon, authenticated;
grant execute on function public.platform_enterprise_actor()
  to authenticated, service_role;

-- ------------------------------------------------------------
-- Platform directory/detail.
-- ------------------------------------------------------------

create or replace function public.platform_enterprise_directory(
  p_search text default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(pg_catalog.btrim(p_search), '');
  v_status text := nullif(pg_catalog.btrim(p_status), '');
  v_total bigint;
  v_items jsonb;
begin
  perform public.platform_enterprise_actor();

  select count(*)
  into v_total
  from public.enterprise_accounts account
  left join public.organizations organization
    on organization.id = account.organization_id
  where
    (v_status is null or account.onboarding_status = v_status)
    and (
      v_search is null
      or account.contact_name ilike '%' || v_search || '%'
      or account.contact_email ilike '%' || v_search || '%'
      or coalesce(account.company_name, '') ilike '%' || v_search || '%'
      or coalesce(organization.name, '') ilike '%' || v_search || '%'
    );

  select coalesce(jsonb_agg(item order by item_created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      jsonb_build_object(
        'id', account.id,
        'contactName', account.contact_name,
        'contactEmail', account.contact_email,
        'companyName', account.company_name,
        'organizationId', account.organization_id,
        'organizationName', organization.name,
        'onboardingStatus', account.onboarding_status,
        'proposedMonthlyPriceCents', account.proposed_monthly_price_cents,
        'paymentStatus', account.payment_status,
        'paymongoCheckoutId', account.paymongo_checkout_id,
        'paymongoPaymentId', account.paymongo_payment_id,
        'createdAt', account.created_at,
        'updatedAt', account.updated_at
      ) as item,
      account.created_at as item_created_at
    from public.enterprise_accounts account
    left join public.organizations organization
      on organization.id = account.organization_id
    where
      (v_status is null or account.onboarding_status = v_status)
      and (
        v_search is null
        or account.contact_name ilike '%' || v_search || '%'
        or account.contact_email ilike '%' || v_search || '%'
        or coalesce(account.company_name, '') ilike '%' || v_search || '%'
        or coalesce(organization.name, '') ilike '%' || v_search || '%'
      )
    order by account.created_at desc
    limit v_limit offset v_offset
  ) rows;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function public.platform_enterprise_detail(
  p_account_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  account public.enterprise_accounts%rowtype;
  inquiry public.contact_inquiries%rowtype;
  organization public.organizations%rowtype;
  subscription public.organization_subscriptions%rowtype;
  plan public.subscription_plans%rowtype;
begin
  perform public.platform_enterprise_actor();

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id;

  if account.id is null then
    return null;
  end if;

  if account.inquiry_id is not null then
    select *
    into inquiry
    from public.contact_inquiries
    where id = account.inquiry_id;
  end if;

  if account.organization_id is not null then
    select *
    into organization
    from public.organizations
    where id = account.organization_id;

    select *
    into subscription
    from public.organization_subscriptions
    where organization_id = account.organization_id;

    if subscription.plan_id is not null then
      select *
      into plan
      from public.subscription_plans
      where id = subscription.plan_id;
    end if;
  end if;

  return jsonb_build_object(
    'id', account.id,
    'inquiryId', account.inquiry_id,
    'inquiryMessage', inquiry.message,
    'inquiryCreatedAt', inquiry.created_at,
    'contactName', account.contact_name,
    'contactEmail', account.contact_email,
    'companyName', account.company_name,
    'organizationId', account.organization_id,
    'organizationName', organization.name,
    'currentPlanCode', plan.code,
    'subscriptionStatus', subscription.status,
    'currentPeriodEnd', subscription.current_period_end,
    'paidPeriodActive', (
      subscription.current_period_end is not null
      and subscription.current_period_end > pg_catalog.now()
      and subscription.status in ('active', 'suspended')
    ),
    'onboardingStatus', account.onboarding_status,
    'proposedMonthlyPriceCents', account.proposed_monthly_price_cents,
    'currency', account.currency,
    'customMemberLimit', account.custom_member_limit,
    'customContactLimit', account.custom_contact_limit,
    'customActiveCampaignLimit', account.custom_active_campaign_limit,
    'customActiveSequenceLimit', account.custom_active_sequence_limit,
    'customStorageBytes', account.custom_storage_bytes,
    'customRecordingRetentionDays', account.custom_recording_retention_days,
    'customAiRequestsPerMonth', account.custom_ai_requests_per_month,
    'customTranscriptionMinutesPerMonth', account.custom_transcription_minutes_per_month,
    'contractReferenceNotes', account.contract_reference_notes,
    'paymentStatus', account.payment_status,
    'paymongoCheckoutId', account.paymongo_checkout_id,
    'paymongoCheckoutUrl', account.paymongo_checkout_url,
    'paymongoPaymentId', account.paymongo_payment_id,
    'lastAppliedPaymentId', account.last_applied_payment_id,
    'checkoutExpiresAt', account.checkout_expires_at,
    'paymentAmountCents', account.payment_amount_cents,
    'paidAt', account.paid_at,
    'activatedAt', account.activated_at,
    'suspendedAt', account.suspended_at,
    'createdAt', account.created_at,
    'updatedAt', account.updated_at
  );
end;
$$;

-- ------------------------------------------------------------
-- Manual Enterprise lead creation for off-platform sales inquiries.
-- ------------------------------------------------------------

create or replace function public.platform_create_enterprise_account(
  p_contact_name text,
  p_contact_email text,
  p_company_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  v_name text := pg_catalog.btrim(coalesce(p_contact_name, ''));
  v_email text := lower(pg_catalog.btrim(coalesce(p_contact_email, '')));
  v_company text := nullif(pg_catalog.btrim(p_company_name), '');
  v_id uuid;
begin
  select * into actor from public.platform_enterprise_actor();

  if length(v_name) < 2 then
    raise exception 'Contact name must contain at least 2 characters.';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid Enterprise contact email address.';
  end if;

  insert into public.enterprise_accounts (
    contact_name,
    contact_email,
    company_name,
    created_by,
    updated_by
  )
  values (
    v_name,
    v_email,
    v_company,
    actor.user_id,
    actor.user_id
  )
  returning id into v_id;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    reason,
    resulting_state
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'enterprise.account.created',
    'enterprise_account',
    v_id::text,
    'Manual Enterprise inquiry/customer record created.',
    jsonb_build_object(
      'contact_email', v_email,
      'company_name', v_company
    )
  );

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Save proposal, organization link, custom limits, onboarding state and notes.
-- ------------------------------------------------------------

create or replace function public.platform_save_enterprise_account(
  p_account_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_company_name text,
  p_organization_id uuid,
  p_onboarding_status text,
  p_proposed_monthly_price_cents integer,
  p_custom_member_limit integer,
  p_custom_contact_limit integer,
  p_custom_active_campaign_limit integer,
  p_custom_active_sequence_limit integer,
  p_custom_storage_bytes bigint,
  p_custom_recording_retention_days integer,
  p_custom_ai_requests_per_month integer,
  p_custom_transcription_minutes_per_month integer,
  p_contract_reference_notes text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  account public.enterprise_accounts%rowtype;
  previous_state jsonb;
  v_name text := pg_catalog.btrim(coalesce(p_contact_name, ''));
  v_email text := lower(pg_catalog.btrim(coalesce(p_contact_email, '')));
  v_company text := nullif(pg_catalog.btrim(p_company_name), '');
  v_status text := lower(pg_catalog.btrim(coalesce(p_onboarding_status, '')));
  v_notes text := nullif(pg_catalog.btrim(p_contract_reference_notes), '');
begin
  select * into actor from public.platform_enterprise_actor();

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id
  for update;

  if account.id is null then
    raise exception 'Enterprise account was not found.';
  end if;

  if length(v_name) < 2 then
    raise exception 'Contact name must contain at least 2 characters.';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid Enterprise contact email address.';
  end if;

  if v_status not in (
    'inquiry',
    'qualified',
    'proposal',
    'awaiting_payment',
    'payment_confirmed',
    'onboarding',
    'ready',
    'active',
    'suspended',
    'closed'
  ) then
    raise exception 'Invalid Enterprise onboarding status.';
  end if;

  if v_status is distinct from account.onboarding_status
     and (
       v_status in ('active', 'suspended')
       or account.onboarding_status in ('active', 'suspended')
     ) then
    raise exception 'Use the dedicated Activate Enterprise or Suspend Enterprise action to change an active or suspended Enterprise workspace.';
  end if;

  if p_organization_id is not null
     and not exists (
       select 1 from public.organizations
       where id = p_organization_id
     ) then
    raise exception 'The selected Flowtix organization does not exist.';
  end if;

  if p_organization_id is not null
     and exists (
       select 1
       from public.enterprise_accounts other_account
       where other_account.organization_id = p_organization_id
         and other_account.id <> account.id
     ) then
    raise exception 'That Flowtix organization is already linked to another Enterprise account.';
  end if;

  if account.onboarding_status in ('active', 'suspended')
     and p_organization_id is distinct from account.organization_id then
    raise exception 'The linked organization cannot be changed while Enterprise is active or suspended.';
  end if;

  if account.payment_status = 'pending'
     and p_organization_id is distinct from account.organization_id then
    raise exception 'The linked organization cannot be changed while an Enterprise PayMongo checkout is pending.';
  end if;

  if account.payment_status = 'paid'
     and account.paymongo_payment_id is distinct from account.last_applied_payment_id
     and p_organization_id is distinct from account.organization_id then
    raise exception 'Apply or resolve the verified Enterprise payment before changing the linked organization.';
  end if;

  if account.payment_status = 'pending'
     and p_proposed_monthly_price_cents is distinct from account.proposed_monthly_price_cents then
    raise exception 'The Enterprise monthly price cannot be changed while a PayMongo checkout is pending.';
  end if;

  if account.payment_status = 'paid'
     and account.paymongo_payment_id is distinct from account.last_applied_payment_id
     and p_proposed_monthly_price_cents is distinct from account.proposed_monthly_price_cents then
    raise exception 'Apply or resolve the verified Enterprise payment before changing the monthly price.';
  end if;

  if v_status = 'closed'
     and account.payment_status in ('pending', 'paid')
     and (
       account.payment_status = 'pending'
       or account.paymongo_payment_id is distinct from account.last_applied_payment_id
     ) then
    raise exception 'Resolve the current Enterprise PayMongo checkout/payment before closing this account.';
  end if;

  if p_proposed_monthly_price_cents is not null
     and p_proposed_monthly_price_cents <= 0 then
    raise exception 'Enterprise monthly price must be greater than zero.';
  end if;

  if p_custom_member_limit is not null and p_custom_member_limit < 25 then
    raise exception 'Enterprise custom user limit must be at least 25 users.';
  end if;

  if (p_custom_member_limit is not null and p_custom_member_limit < 0)
     or (p_custom_contact_limit is not null and p_custom_contact_limit < 0)
     or (p_custom_active_campaign_limit is not null and p_custom_active_campaign_limit < 0)
     or (p_custom_active_sequence_limit is not null and p_custom_active_sequence_limit < 0)
     or (p_custom_storage_bytes is not null and p_custom_storage_bytes < 0)
     or (p_custom_recording_retention_days is not null and p_custom_recording_retention_days < 0)
     or (p_custom_ai_requests_per_month is not null and p_custom_ai_requests_per_month < 0)
     or (p_custom_transcription_minutes_per_month is not null and p_custom_transcription_minutes_per_month < 0)
  then
    raise exception 'Enterprise custom limits cannot be negative.';
  end if;

  previous_state := jsonb_build_object(
    'organization_id', account.organization_id,
    'onboarding_status', account.onboarding_status,
    'proposed_monthly_price_cents', account.proposed_monthly_price_cents,
    'custom_member_limit', account.custom_member_limit,
    'custom_contact_limit', account.custom_contact_limit,
    'custom_active_campaign_limit', account.custom_active_campaign_limit,
    'custom_active_sequence_limit', account.custom_active_sequence_limit,
    'custom_storage_bytes', account.custom_storage_bytes,
    'custom_recording_retention_days', account.custom_recording_retention_days,
    'custom_ai_requests_per_month', account.custom_ai_requests_per_month,
    'custom_transcription_minutes_per_month', account.custom_transcription_minutes_per_month
  );

  update public.enterprise_accounts
  set
    contact_name = v_name,
    contact_email = v_email,
    company_name = v_company,
    organization_id = p_organization_id,
    onboarding_status = v_status,
    proposed_monthly_price_cents = p_proposed_monthly_price_cents,
    custom_member_limit = p_custom_member_limit,
    custom_contact_limit = p_custom_contact_limit,
    custom_active_campaign_limit = p_custom_active_campaign_limit,
    custom_active_sequence_limit = p_custom_active_sequence_limit,
    custom_storage_bytes = p_custom_storage_bytes,
    custom_recording_retention_days = p_custom_recording_retention_days,
    custom_ai_requests_per_month = p_custom_ai_requests_per_month,
    custom_transcription_minutes_per_month = p_custom_transcription_minutes_per_month,
    contract_reference_notes = v_notes,
    updated_by = actor.user_id,
    updated_at = pg_catalog.now()
  where id = account.id;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'enterprise.account.updated',
    'enterprise_account',
    account.id::text,
    p_organization_id,
    'Enterprise proposal/onboarding details updated.',
    previous_state,
    jsonb_build_object(
      'organization_id', p_organization_id,
      'onboarding_status', v_status,
      'proposed_monthly_price_cents', p_proposed_monthly_price_cents,
      'custom_member_limit', p_custom_member_limit,
      'custom_contact_limit', p_custom_contact_limit,
      'custom_active_campaign_limit', p_custom_active_campaign_limit,
      'custom_active_sequence_limit', p_custom_active_sequence_limit,
      'custom_storage_bytes', p_custom_storage_bytes,
      'custom_recording_retention_days', p_custom_recording_retention_days,
      'custom_ai_requests_per_month', p_custom_ai_requests_per_month,
      'custom_transcription_minutes_per_month', p_custom_transcription_minutes_per_month
    )
  );

  return true;
end;
$$;

-- ------------------------------------------------------------
-- Dedicated Enterprise PayMongo checkout lease/finalization.
-- These do not touch organization_subscriptions.
-- ------------------------------------------------------------

create or replace function public.platform_begin_enterprise_checkout(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  account public.enterprise_accounts%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select * into actor from public.platform_enterprise_actor();

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id
  for update;

  if account.id is null then
    raise exception 'Enterprise account was not found.';
  end if;

  if account.onboarding_status = 'closed' then
    raise exception 'Reopen the Enterprise account before creating a new PayMongo checkout.';
  end if;

  if account.proposed_monthly_price_cents is null
     or account.proposed_monthly_price_cents <= 0 then
    raise exception 'Set the Enterprise proposed monthly price before creating checkout.';
  end if;

  if account.payment_status = 'paid'
     and account.paymongo_payment_id is distinct from account.last_applied_payment_id then
    raise exception 'The verified Enterprise payment must be applied before another checkout is created.';
  end if;

  if account.checkout_creation_token is not null
     and account.checkout_creation_started_at > pg_catalog.now() - interval '10 minutes' then
    raise exception 'An Enterprise PayMongo checkout is already being created.';
  end if;

  if account.payment_status = 'pending'
     and account.paymongo_checkout_id is not null
     and account.checkout_expires_at > pg_catalog.now() then
    raise exception 'An Enterprise PayMongo checkout is already pending.';
  end if;

  update public.enterprise_accounts
  set
    checkout_creation_token = v_token,
    checkout_creation_started_at = pg_catalog.now(),
    updated_by = actor.user_id,
    updated_at = pg_catalog.now()
  where id = account.id;

  return jsonb_build_object(
    'accountId', account.id,
    'creationToken', v_token,
    'amountCents', account.proposed_monthly_price_cents,
    'currency', account.currency,
    'contactEmail', account.contact_email,
    'contactName', account.contact_name,
    'companyName', account.company_name,
    'organizationId', account.organization_id
  );
end;
$$;

create or replace function public.platform_finalize_enterprise_checkout(
  p_account_id uuid,
  p_creation_token uuid,
  p_checkout_id text,
  p_checkout_url text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  account public.enterprise_accounts%rowtype;
  v_checkout_id text := nullif(pg_catalog.btrim(p_checkout_id), '');
  v_checkout_url text := nullif(pg_catalog.btrim(p_checkout_url), '');
begin
  select * into actor from public.platform_enterprise_actor();

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id
  for update;

  if account.id is null then
    raise exception 'Enterprise account was not found.';
  end if;

  if account.checkout_creation_token is distinct from p_creation_token then
    raise exception 'Enterprise checkout creation lease is no longer valid.';
  end if;

  if account.checkout_creation_started_at is null
     or account.checkout_creation_started_at < pg_catalog.now() - interval '15 minutes' then
    raise exception 'Enterprise checkout creation lease expired.';
  end if;

  if v_checkout_id is null or v_checkout_url is null then
    raise exception 'PayMongo returned an invalid Enterprise checkout.';
  end if;

  if p_expires_at is null or p_expires_at <= pg_catalog.now() then
    raise exception 'Enterprise checkout expiration must be in the future.';
  end if;

  update public.enterprise_accounts
  set
    onboarding_status = case
      when onboarding_status in ('active', 'suspended') then onboarding_status
      else 'awaiting_payment'
    end,
    payment_status = 'pending',
    paymongo_checkout_id = v_checkout_id,
    paymongo_checkout_url = v_checkout_url,
    paymongo_payment_id = null,
    checkout_expires_at = p_expires_at,
    payment_amount_cents = null,
    paid_at = null,
    checkout_creation_token = null,
    checkout_creation_started_at = null,
    updated_by = actor.user_id,
    updated_at = pg_catalog.now()
  where id = account.id;

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    resulting_state
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'enterprise.checkout.created',
    'enterprise_account',
    account.id::text,
    account.organization_id,
    'Enterprise PayMongo checkout created.',
    jsonb_build_object(
      'checkout_id', v_checkout_id,
      'amount_cents', account.proposed_monthly_price_cents,
      'currency', 'PHP',
      'expires_at', p_expires_at
    )
  );

  return true;
end;
$$;

create or replace function public.platform_abandon_enterprise_checkout(
  p_account_id uuid,
  p_creation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  perform public.platform_enterprise_actor();

  update public.enterprise_accounts
  set
    checkout_creation_token = null,
    checkout_creation_started_at = null,
    updated_at = pg_catalog.now()
  where id = p_account_id
    and checkout_creation_token = p_creation_token;

  return found;
end;
$$;

-- ------------------------------------------------------------
-- PayMongo webhook processor for Enterprise assisted checkout.
-- Payment confirmation updates the Enterprise sales record only.
-- It deliberately does not activate organization_subscriptions.
-- ------------------------------------------------------------

create or replace function public.process_enterprise_paymongo_event(
  p_enterprise_account_id uuid,
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_signature_timestamp timestamptz,
  p_resource_type text,
  p_resource_id text,
  p_checkout_id text,
  p_payment_id text,
  p_amount integer,
  p_currency text,
  p_payment_status text,
  p_failure_code text,
  p_failure_message text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  account public.enterprise_accounts%rowtype;
  v_event_id text := nullif(pg_catalog.btrim(p_event_id), '');
  v_event_type text := lower(coalesce(nullif(pg_catalog.btrim(p_event_type), ''), 'unknown'));
  v_checkout_id text := nullif(pg_catalog.btrim(p_checkout_id), '');
  v_payment_id text := nullif(pg_catalog.btrim(p_payment_id), '');
  v_currency text := upper(coalesce(nullif(pg_catalog.btrim(p_currency), ''), ''));
  v_payment_status text := lower(coalesce(nullif(pg_catalog.btrim(p_payment_status), ''), ''));
  v_new_payment_status text := null;
  v_new_onboarding_status text := null;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if v_event_id is null then
    raise exception 'PayMongo event ID is required.';
  end if;

  insert into public.billing_payment_events (
    organization_id,
    provider,
    provider_event_id,
    event_type,
    livemode,
    signature_timestamp,
    provider_resource_type,
    provider_resource_id,
    checkout_id,
    payment_id,
    plan_code,
    status,
    payload
  )
  select
    enterprise.organization_id,
    'paymongo',
    v_event_id,
    v_event_type,
    p_livemode,
    p_signature_timestamp,
    p_resource_type,
    p_resource_id,
    v_checkout_id,
    v_payment_id,
    'enterprise',
    'received',
    coalesce(p_payload, '{}'::jsonb)
  from public.enterprise_accounts enterprise
  where enterprise.id = p_enterprise_account_id
  on conflict (provider, provider_event_id) do nothing;

  select *
  into account
  from public.enterprise_accounts
  where id = p_enterprise_account_id
  for update;

  if account.id is null then
    update public.billing_payment_events
    set
      status = 'ignored',
      ignored_reason = 'enterprise_account_not_found',
      processed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where provider = 'paymongo'
      and provider_event_id = v_event_id;

    return jsonb_build_object(
      'status', 'ignored',
      'reason', 'enterprise_account_not_found'
    );
  end if;

  if v_checkout_id is null then
    v_checkout_id := account.paymongo_checkout_id;
  end if;

  if account.paymongo_checkout_id is null
     or v_checkout_id is null
     or account.paymongo_checkout_id is distinct from v_checkout_id then
    update public.billing_payment_events
    set
      status = 'ignored',
      ignored_reason = 'enterprise_checkout_mismatch',
      processed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where provider = 'paymongo'
      and provider_event_id = v_event_id;

    return jsonb_build_object(
      'status', 'ignored',
      'reason', 'enterprise_checkout_mismatch'
    );
  end if;

  if (
    v_event_type = 'checkout_session.payment.paid'
    or v_event_type = 'payment.paid'
    or v_payment_status = 'paid'
  ) then
    if p_amount is null
       or account.proposed_monthly_price_cents is null
       or p_amount is distinct from account.proposed_monthly_price_cents
       or v_currency <> 'PHP'
       or v_payment_id is null then
      update public.billing_payment_events
      set
        status = 'ignored',
        ignored_reason = 'enterprise_payment_mismatch',
        processed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
      where provider = 'paymongo'
        and provider_event_id = v_event_id;

      return jsonb_build_object(
        'status', 'ignored',
        'reason', 'enterprise_payment_mismatch'
      );
    end if;

    v_new_payment_status := 'paid';
    v_new_onboarding_status := case
      when account.onboarding_status in ('active', 'suspended')
        then account.onboarding_status
      else 'payment_confirmed'
    end;

    update public.enterprise_accounts
    set
      payment_status = v_new_payment_status,
      onboarding_status = v_new_onboarding_status,
      paymongo_payment_id = v_payment_id,
      payment_amount_cents = p_amount,
      paid_at = coalesce(paid_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
    where id = account.id;

  elsif v_event_type like '%expired%' then
    v_new_payment_status := 'expired';

    update public.enterprise_accounts
    set
      payment_status = 'expired',
      onboarding_status = case
        when onboarding_status in ('active', 'suspended') then onboarding_status
        else 'proposal'
      end,
      updated_at = pg_catalog.now()
    where id = account.id
      and payment_status <> 'paid';

  elsif v_event_type like '%refund%' then
    v_new_payment_status := case
      when v_event_type like '%partial%' then 'partially_refunded'
      else 'refunded'
    end;

    update public.enterprise_accounts
    set
      payment_status = v_new_payment_status,
      updated_at = pg_catalog.now()
    where id = account.id;

  elsif v_event_type like '%fail%'
        or v_payment_status = 'failed' then
    v_new_payment_status := 'failed';

    update public.enterprise_accounts
    set
      payment_status = 'failed',
      onboarding_status = case
        when onboarding_status in ('active', 'suspended') then onboarding_status
        else 'proposal'
      end,
      updated_at = pg_catalog.now()
    where id = account.id
      and payment_status <> 'paid';

  else
    update public.billing_payment_events
    set
      status = 'ignored',
      ignored_reason = 'enterprise_event_not_actionable',
      processed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where provider = 'paymongo'
      and provider_event_id = v_event_id;

    return jsonb_build_object(
      'status', 'ignored',
      'reason', 'enterprise_event_not_actionable'
    );
  end if;

  update public.billing_payment_events
  set
    organization_id = account.organization_id,
    checkout_id = v_checkout_id,
    payment_id = v_payment_id,
    status = 'processed',
    error_message = case
      when v_new_payment_status = 'failed'
        then left(coalesce(p_failure_message, p_failure_code, 'PayMongo payment failed.'), 1000)
      else null
    end,
    processed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where provider = 'paymongo'
    and provider_event_id = v_event_id;

  return jsonb_build_object(
    'status', 'processed',
    'enterprise_account_id', account.id,
    'payment_status', v_new_payment_status
  );
end;
$$;

revoke all on function public.process_enterprise_paymongo_event(
  uuid, text, text, boolean, timestamptz, text, text, text, text,
  integer, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.process_enterprise_paymongo_event(
  uuid, text, text, boolean, timestamptz, text, text, text, text,
  integer, text, text, text, text, jsonb
) to service_role;

-- ------------------------------------------------------------
-- Manual provider sync from Platform Admin. The server action retrieves the
-- PayMongo checkout directly with the secret key, then supplies observed
-- provider values here.
-- ------------------------------------------------------------

create or replace function public.platform_sync_enterprise_payment(
  p_account_id uuid,
  p_checkout_id text,
  p_payment_id text,
  p_payment_status text,
  p_amount integer,
  p_currency text,
  p_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  account public.enterprise_accounts%rowtype;
  v_status text := lower(coalesce(nullif(pg_catalog.btrim(p_payment_status), ''), ''));
  v_currency text := upper(coalesce(nullif(pg_catalog.btrim(p_currency), ''), ''));
begin
  select * into actor from public.platform_enterprise_actor();

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id
  for update;

  if account.id is null then
    raise exception 'Enterprise account was not found.';
  end if;

  if account.paymongo_checkout_id is distinct from nullif(pg_catalog.btrim(p_checkout_id), '') then
    raise exception 'PayMongo checkout does not match this Enterprise account.';
  end if;

  if v_status = 'paid' then
    if p_amount is distinct from account.proposed_monthly_price_cents
       or v_currency <> 'PHP'
       or nullif(pg_catalog.btrim(p_payment_id), '') is null then
      raise exception 'Verified PayMongo payment does not match the Enterprise proposal.';
    end if;

    update public.enterprise_accounts
    set
      payment_status = 'paid',
      onboarding_status = case
        when onboarding_status in ('active', 'suspended') then onboarding_status
        else 'payment_confirmed'
      end,
      paymongo_payment_id = pg_catalog.btrim(p_payment_id),
      payment_amount_cents = p_amount,
      paid_at = coalesce(p_paid_at, paid_at, pg_catalog.now()),
      updated_by = actor.user_id,
      updated_at = pg_catalog.now()
    where id = account.id;
  else
    update public.enterprise_accounts
    set
      payment_status = case
        when v_status in ('failed', 'expired') then v_status
        else payment_status
      end,
      updated_by = actor.user_id,
      updated_at = pg_catalog.now()
    where id = account.id
      and payment_status <> 'paid';
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- Activate / suspend Enterprise.
-- ------------------------------------------------------------

create or replace function public.platform_activate_enterprise_account(
  p_account_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  account public.enterprise_accounts%rowtype;
  enterprise_plan public.subscription_plans%rowtype;
  subscription public.organization_subscriptions%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_period_start timestamptz;
begin
  select * into actor from public.platform_enterprise_actor();

  if normalized_reason is null or length(normalized_reason) < 10 then
    raise exception 'Enter an activation reason of at least 10 characters.';
  end if;

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id
  for update;

  if account.id is null then
    raise exception 'Enterprise account was not found.';
  end if;

  if account.onboarding_status = 'closed' then
    raise exception 'Reopen the Enterprise account and complete onboarding before activation.';
  end if;

  if account.onboarding_status not in ('ready', 'active', 'suspended') then
    raise exception 'Set Enterprise onboarding status to Ready before initial activation.';
  end if;

  if account.organization_id is null then
    raise exception 'Link a Flowtix organization before Enterprise activation.';
  end if;

  if account.custom_member_limit is null or account.custom_member_limit < 25 then
    raise exception 'Enterprise user limit must be configured to at least 25 users.';
  end if;

  if account.custom_contact_limit is null or account.custom_contact_limit <= 0
     or account.custom_active_campaign_limit is null or account.custom_active_campaign_limit <= 0
     or account.custom_active_sequence_limit is null or account.custom_active_sequence_limit <= 0
     or account.custom_storage_bytes is null or account.custom_storage_bytes <= 0
     or account.custom_recording_retention_days is null or account.custom_recording_retention_days <= 0
     or account.custom_ai_requests_per_month is null or account.custom_ai_requests_per_month < 0
     or account.custom_transcription_minutes_per_month is null or account.custom_transcription_minutes_per_month < 0
  then
    raise exception 'Configure all required Enterprise custom limits before activation.';
  end if;

  select *
  into enterprise_plan
  from public.subscription_plans
  where code = 'enterprise'
    and is_active = true
  limit 1;

  if enterprise_plan.id is null then
    raise exception 'Enterprise subscription plan is unavailable.';
  end if;

  select *
  into subscription
  from public.organization_subscriptions
  where organization_id = account.organization_id
  for update;

  if subscription.id is null then
    raise exception 'The linked organization does not have a subscription record.';
  end if;

  -- A suspended Enterprise workspace may be reactivated during its already-paid
  -- period without charging again. Every initial activation or renewal otherwise
  -- requires a new verified payment that has not been applied before.
  if account.onboarding_status = 'suspended'
     and subscription.plan_id = enterprise_plan.id
     and subscription.current_period_end is not null
     and subscription.current_period_end > pg_catalog.now()
     and account.last_applied_payment_id is not null then
    v_period_start := subscription.current_period_start;
  else
    if account.payment_status <> 'paid'
       or account.paymongo_checkout_id is null
       or account.paymongo_payment_id is null
       or account.paid_at is null then
      raise exception 'Verified PayMongo payment is required before Enterprise activation or renewal.';
    end if;

    if account.proposed_monthly_price_cents is null
       or account.payment_amount_cents is distinct from account.proposed_monthly_price_cents then
      raise exception 'Enterprise payment amount does not match the approved proposal.';
    end if;

    if account.paymongo_payment_id is not distinct from account.last_applied_payment_id then
      raise exception 'This Enterprise PayMongo payment has already been applied.';
    end if;

    v_period_start := account.paid_at;
  end if;

  update public.organization_subscriptions
  set
    plan_id = enterprise_plan.id,
    pending_plan_id = null,
    scheduled_plan_id = null,
    scheduled_plan_effective_at = null,
    status = 'active',
    billing_provider = 'paymongo',
    paymongo_checkout_id = account.paymongo_checkout_id,
    paymongo_plan_code = 'enterprise',
    paymongo_payment_id = account.paymongo_payment_id,
    provider_checkout_id = account.paymongo_checkout_id,
    provider_payment_id = account.paymongo_payment_id,
    current_period_start = v_period_start,
    current_period_end = case
      when account.onboarding_status = 'suspended'
        and subscription.current_period_end is not null
        and subscription.current_period_end > pg_catalog.now()
        and account.last_applied_payment_id is not null
        and account.paymongo_payment_id is not distinct from account.last_applied_payment_id
        then subscription.current_period_end
      else v_period_start + interval '1 month'
    end,
    pending_checkout_expires_at = null,
    cancel_at_period_end = false,
    activated_at = coalesce(activated_at, pg_catalog.now()),
    cancelled_at = null,
    grace_period_ends_at = null,
    payment_failure_count = 0,
    renewal_attempt_count = 0,
    next_renewal_attempt_at = null,
    last_payment_status = 'paid',
    trial_converted_at = case
      when subscription.status = 'trialing'
        then coalesce(trial_converted_at, pg_catalog.now())
      else trial_converted_at
    end,
    last_billing_event_at = greatest(coalesce(last_billing_event_at, account.paid_at), account.paid_at),
    checkout_creation_token = null,
    checkout_creation_started_at = null,
    billing_metadata = coalesce(billing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'enterprise_account_id', account.id,
        'enterprise_monthly_price_cents', account.proposed_monthly_price_cents,
        'enterprise_currency', 'PHP',
        'enterprise_activated_at', pg_catalog.now()
      ),
    updated_at = pg_catalog.now()
  where id = subscription.id;

  update public.enterprise_accounts
  set
    onboarding_status = 'active',
    last_applied_payment_id = case
      when paymongo_payment_id is not null then paymongo_payment_id
      else last_applied_payment_id
    end,
    activated_at = coalesce(activated_at, pg_catalog.now()),
    suspended_at = null,
    updated_by = actor.user_id,
    updated_at = pg_catalog.now()
  where id = account.id;

  insert into public.subscription_lifecycle_events (
    organization_id,
    subscription_id,
    event_type,
    source,
    previous_status,
    new_status,
    plan_id,
    actor_user_id,
    metadata
  )
  values (
    account.organization_id,
    subscription.id,
    'enterprise_activated',
    'system',
    subscription.status,
    'active',
    enterprise_plan.id,
    actor.user_id,
    jsonb_build_object(
      'platform_action', true,
      'enterprise_account_id', account.id,
      'reason', normalized_reason,
      'monthly_price_cents', account.proposed_monthly_price_cents,
      'checkout_id', account.paymongo_checkout_id,
      'payment_id', account.paymongo_payment_id
    )
  );

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason,
    previous_state,
    resulting_state
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'enterprise.account.activated',
    'enterprise_account',
    account.id::text,
    account.organization_id,
    normalized_reason,
    jsonb_build_object(
      'subscription_status', subscription.status,
      'plan_id', subscription.plan_id
    ),
    jsonb_build_object(
      'subscription_status', 'active',
      'plan_code', 'enterprise',
      'monthly_price_cents', account.proposed_monthly_price_cents
    )
  );

  return true;
end;
$$;

create or replace function public.platform_suspend_enterprise_account(
  p_account_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  actor public.platform_users%rowtype;
  account public.enterprise_accounts%rowtype;
  subscription public.organization_subscriptions%rowtype;
  normalized_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  select * into actor from public.platform_enterprise_actor();

  if normalized_reason is null or length(normalized_reason) < 10 then
    raise exception 'Enter a suspension reason of at least 10 characters.';
  end if;

  select *
  into account
  from public.enterprise_accounts
  where id = p_account_id
  for update;

  if account.id is null then
    raise exception 'Enterprise account was not found.';
  end if;

  if account.organization_id is null then
    raise exception 'This Enterprise account is not linked to a Flowtix organization.';
  end if;

  select *
  into subscription
  from public.organization_subscriptions
  where organization_id = account.organization_id
  for update;

  if subscription.id is null then
    raise exception 'The linked organization subscription was not found.';
  end if;

  if subscription.status = 'suspended'
     and account.onboarding_status = 'suspended' then
    return true;
  end if;

  update public.organization_subscriptions
  set
    status = 'suspended',
    last_payment_status = coalesce(last_payment_status, 'paid'),
    updated_at = pg_catalog.now()
  where id = subscription.id;

  update public.enterprise_accounts
  set
    onboarding_status = 'suspended',
    suspended_at = pg_catalog.now(),
    updated_by = actor.user_id,
    updated_at = pg_catalog.now()
  where id = account.id;

  insert into public.subscription_lifecycle_events (
    organization_id,
    subscription_id,
    event_type,
    source,
    previous_status,
    new_status,
    plan_id,
    actor_user_id,
    metadata
  )
  values (
    account.organization_id,
    subscription.id,
    'enterprise_suspended',
    'system',
    subscription.status,
    'suspended',
    subscription.plan_id,
    actor.user_id,
    jsonb_build_object(
      'platform_action', true,
      'enterprise_account_id', account.id,
      'reason', normalized_reason
    )
  );

  insert into public.platform_audit_logs (
    platform_user_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    organization_id,
    reason
  )
  values (
    actor.id,
    actor.user_id,
    actor.role,
    'enterprise.account.suspended',
    'enterprise_account',
    account.id::text,
    account.organization_id,
    normalized_reason
  );

  return true;
end;
$$;

-- ------------------------------------------------------------
-- Enterprise-aware quota resolution.
-- ------------------------------------------------------------

create or replace function public.consume_organization_usage(
  target_org uuid,
  usage_metric text,
  usage_units integer default 1,
  usage_idempotency_key text default null
)
returns table (
  metric text,
  used bigint,
  limit_value integer,
  remaining bigint
)
language plpgsql
volatile
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_period date := public.usage_period_start();
  v_limit integer;
  v_used bigint;
  v_existing public.organization_usage_events%rowtype;
  v_status text;
  v_grace_end timestamptz;
  v_trial_end timestamptz;
begin
  if usage_metric not in (
    'ai_requests',
    'emails',
    'sms',
    'transcription_seconds'
  ) then
    raise exception 'INVALID_USAGE_METRIC'
      using errcode = '22023';
  end if;

  if usage_units <= 0 then
    raise exception 'INVALID_USAGE_UNITS'
      using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  select
    subscription.status,
    subscription.grace_period_ends_at,
    subscription.trial_ends_at,
    case usage_metric
      when 'ai_requests' then
        case when plan.code = 'enterprise'
          then enterprise.custom_ai_requests_per_month
          else plan.max_ai_requests_per_month end
      when 'emails' then plan.max_emails_per_month
      when 'sms' then plan.max_sms_per_month
      when 'transcription_seconds' then
        case
          when plan.code = 'enterprise' then
            case when enterprise.custom_transcription_minutes_per_month is null
              then null
              else enterprise.custom_transcription_minutes_per_month * 60 end
          when plan.max_transcription_minutes_per_month is null then null
          else plan.max_transcription_minutes_per_month * 60
        end
    end
  into
    v_status,
    v_grace_end,
    v_trial_end,
    v_limit
  from public.organization_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
  left join public.enterprise_accounts enterprise
    on enterprise.organization_id = target_org
  where subscription.organization_id = target_org
  limit 1;

  if v_status = 'trialing'
     and (
       v_trial_end is null
       or v_trial_end <= pg_catalog.now()
     ) then
    v_status := 'pending';
  end if;

  if not found
     or v_status not in ('active', 'trialing', 'past_due')
     or (
       v_status = 'past_due'
       and (
         v_grace_end is null
         or v_grace_end <= pg_catalog.now()
       )
     ) then
    raise exception 'SUBSCRIPTION_ACCESS_REQUIRED'
      using errcode = 'P0001';
  end if;

  if usage_idempotency_key is not null then
    select usage_event.*
    into v_existing
    from public.organization_usage_events usage_event
    where usage_event.organization_id = target_org
      and usage_event.metric = usage_metric
      and usage_event.idempotency_key = usage_idempotency_key;

    if found then
      select counter.units
      into v_used
      from public.organization_usage_counters counter
      where counter.organization_id = target_org
        and counter.metric = usage_metric
        and counter.period_start = v_period;

      return query
      select
        usage_metric,
        coalesce(v_used, 0),
        v_limit,
        case
          when v_limit is null then null
          else greatest(v_limit::bigint - coalesce(v_used, 0), 0)
        end;

      return;
    end if;
  end if;

  insert into public.organization_usage_counters (
    organization_id,
    metric,
    period_start,
    units
  )
  values (target_org, usage_metric, v_period, 0)
  on conflict on constraint organization_usage_counters_pkey
  do nothing;

  select counter.units
  into v_used
  from public.organization_usage_counters counter
  where counter.organization_id = target_org
    and counter.metric = usage_metric
    and counter.period_start = v_period
  for update;

  if v_limit is not null
     and v_used + usage_units > v_limit then
    raise exception
      'USAGE_LIMIT_REACHED:%:%:%',
      usage_metric,
      v_used,
      v_limit
      using errcode = 'P0001';
  end if;

  insert into public.organization_usage_events (
    organization_id,
    metric,
    units,
    period_start,
    idempotency_key,
    created_by
  )
  values (
    target_org,
    usage_metric,
    usage_units,
    v_period,
    nullif(pg_catalog.btrim(usage_idempotency_key), ''),
    auth.uid()
  )
  on conflict do nothing;

  if not found
     and usage_idempotency_key is not null then
    select counter.units
    into v_used
    from public.organization_usage_counters counter
    where counter.organization_id = target_org
      and counter.metric = usage_metric
      and counter.period_start = v_period;
  else
    update public.organization_usage_counters counter
    set
      units = counter.units + usage_units,
      updated_at = pg_catalog.now()
    where counter.organization_id = target_org
      and counter.metric = usage_metric
      and counter.period_start = v_period
    returning counter.units
    into v_used;
  end if;

  return query
  select
    usage_metric,
    v_used,
    v_limit,
    case
      when v_limit is null then null
      else greatest(v_limit::bigint - v_used, 0)
    end;
end;
$$;

create or replace function public.organization_plan_capacity_snapshot(
  target_org uuid
)
returns table (
  plan_code text,
  plan_name text,
  subscription_status text,
  members_used bigint,
  members_limit integer,
  contacts_used bigint,
  contacts_limit integer,
  calls_used bigint,
  calls_limit integer,
  storage_used bigint,
  storage_limit bigint,
  phone_numbers_used bigint,
  phone_numbers_limit integer,
  api_keys_used bigint,
  api_keys_limit integer,
  active_campaigns_used bigint,
  active_campaigns_limit integer,
  active_sequences_used bigint,
  active_sequences_limit integer,
  transcription_seconds_used bigint,
  transcription_seconds_limit integer,
  recording_retention_days integer
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_period date := public.usage_period_start();
begin
  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  return query
  with active_plan as (
    select
      plan.*,
      case
        when subscription.status = 'trialing'
          and subscription.trial_ends_at is not null
          and subscription.trial_ends_at <= pg_catalog.now()
          then 'pending'
        else subscription.status
      end as resolved_status
    from public.organization_subscriptions subscription
    join public.subscription_plans plan
      on plan.id = subscription.plan_id
    where subscription.organization_id = target_org
    limit 1
  ), resolved_plan as (
    select * from active_plan
    union all
    select plan.*, 'active'::text as resolved_status
    from public.subscription_plans plan
    where plan.code = 'starter'
      and not exists (select 1 from active_plan)
    limit 1
  )
  select
    plan.code::text,
    plan.name::text,
    plan.resolved_status::text,
    (
      (select count(*)
       from public.organization_members member
       where member.organization_id = target_org
         and member.status = 'active')
      +
      (select count(*)
       from public.organization_invitations invitation
       where invitation.organization_id = target_org
         and invitation.accepted_at is null
         and invitation.revoked_at is null
         and invitation.expires_at > pg_catalog.now())
    )::bigint,
    case when plan.code = 'enterprise'
      then enterprise.custom_member_limit else plan.max_members end,
    (select count(*) from public.contacts contact
     where contact.organization_id = target_org),
    case when plan.code = 'enterprise'
      then enterprise.custom_contact_limit else plan.max_contacts end,
    (select count(*) from public.calls call_record
     where call_record.organization_id = target_org
       and call_record.created_at >= v_period),
    plan.max_calls_per_month,
    (
      coalesce(
        (select sum(version.size_bytes)
         from public.attachment_versions version
         where version.organization_id = target_org), 0)
      +
      coalesce(
        (select sum(recording.size_bytes)
         from public.recordings recording
         where recording.organization_id = target_org), 0)
    )::bigint,
    case when plan.code = 'enterprise'
      then enterprise.custom_storage_bytes else plan.max_storage_bytes end,
    (select count(*) from public.organization_phone_numbers phone_number
     where phone_number.organization_id = target_org),
    plan.max_phone_numbers,
    (select count(*) from public.api_keys api_key
     where api_key.organization_id = target_org
       and api_key.revoked_at is null),
    plan.max_api_keys,
    (select count(*) from public.campaigns campaign
     where campaign.organization_id = target_org
       and campaign.status = 'active'),
    case when plan.code = 'enterprise'
      then enterprise.custom_active_campaign_limit else plan.max_active_campaigns end,
    (select count(*) from public.sequences sequence_record
     where sequence_record.organization_id = target_org
       and sequence_record.status = 'active'),
    case when plan.code = 'enterprise'
      then enterprise.custom_active_sequence_limit else plan.max_active_sequences end,
    coalesce(
      (select counter.units
       from public.organization_usage_counters counter
       where counter.organization_id = target_org
         and counter.metric = 'transcription_seconds'
         and counter.period_start = v_period), 0
    ),
    case
      when plan.code = 'enterprise' then
        case when enterprise.custom_transcription_minutes_per_month is null
          then null else enterprise.custom_transcription_minutes_per_month * 60 end
      when plan.max_transcription_minutes_per_month is null then null
      else plan.max_transcription_minutes_per_month * 60
    end,
    case when plan.code = 'enterprise'
      then enterprise.custom_recording_retention_days else plan.recording_retention_days end
  from resolved_plan plan
  left join public.enterprise_accounts enterprise
    on enterprise.organization_id = target_org;
end;
$$;

create or replace function public.organization_usage_snapshot(target_org uuid)
returns table (
  plan_code text, plan_name text, subscription_status text,
  current_period_end timestamptz, cancel_at_period_end boolean,
  members_used bigint, members_limit integer,
  contacts_used bigint, contacts_limit integer,
  calls_used bigint, calls_limit integer,
  storage_used bigint, storage_limit bigint,
  ai_requests_used bigint, ai_requests_limit integer,
  emails_used bigint, emails_limit integer,
  sms_used bigint, sms_limit integer,
  phone_numbers_used bigint, phone_numbers_limit integer,
  api_keys_used bigint, api_keys_limit integer
)
language plpgsql stable security definer
set search_path = public, auth, storage, pg_catalog
as $$
declare
  v_period date := public.usage_period_start();
begin
  if auth.role() <> 'service_role'
     and not public.is_organization_member(target_org) then
    raise exception 'ORGANIZATION_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  with active_plan as (
    select
      p.*,
      case
        when s.status = 'trialing'
          and s.trial_ends_at is not null
          and s.trial_ends_at <= pg_catalog.now()
          then 'pending'
        else s.status
      end as status,
      s.current_period_end,
      s.cancel_at_period_end
    from public.organization_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.organization_id = target_org
    limit 1
  ), resolved_plan as (
    select * from active_plan
    union all
    select p.*, 'active'::text, null::timestamptz, false
    from public.subscription_plans p
    where p.code = 'starter'
      and not exists (select 1 from active_plan)
    limit 1
  )
  select
    p.code::text,
    p.name::text,
    p.status::text,
    p.current_period_end,
    p.cancel_at_period_end,
    (
      (select count(*) from public.organization_members m
       where m.organization_id = target_org and m.status = 'active')
      +
      (select count(*) from public.organization_invitations i
       where i.organization_id = target_org
         and i.accepted_at is null
         and i.revoked_at is null
         and i.expires_at > pg_catalog.now())
    )::bigint,
    case when p.code = 'enterprise'
      then enterprise.custom_member_limit else p.max_members end,
    (select count(*) from public.contacts c
     where c.organization_id = target_org),
    case when p.code = 'enterprise'
      then enterprise.custom_contact_limit else p.max_contacts end,
    (select count(*) from public.calls c
     where c.organization_id = target_org and c.created_at >= v_period),
    p.max_calls_per_month,
    (
      coalesce((select sum(version.size_bytes)
                from public.attachment_versions version
                where version.organization_id = target_org), 0)
      +
      coalesce((select sum(recording.size_bytes)
                from public.recordings recording
                where recording.organization_id = target_org), 0)
    )::bigint,
    case when p.code = 'enterprise'
      then enterprise.custom_storage_bytes else p.max_storage_bytes end,
    coalesce((select c.units from public.organization_usage_counters c
              where c.organization_id = target_org
                and c.metric = 'ai_requests'
                and c.period_start = v_period), 0),
    case when p.code = 'enterprise'
      then enterprise.custom_ai_requests_per_month else p.max_ai_requests_per_month end,
    coalesce((select c.units from public.organization_usage_counters c
              where c.organization_id = target_org
                and c.metric = 'emails'
                and c.period_start = v_period), 0),
    p.max_emails_per_month,
    coalesce((select c.units from public.organization_usage_counters c
              where c.organization_id = target_org
                and c.metric = 'sms'
                and c.period_start = v_period), 0),
    p.max_sms_per_month,
    (select count(*) from public.organization_phone_numbers n
     where n.organization_id = target_org),
    p.max_phone_numbers,
    (select count(*) from public.api_keys k
     where k.organization_id = target_org and k.revoked_at is null),
    p.max_api_keys
  from resolved_plan p
  left join public.enterprise_accounts enterprise
    on enterprise.organization_id = target_org;
end;
$$;

-- Invitation acceptance must honor the negotiated Enterprise member limit.
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
  member_limit integer;
  resulting_reserved_members bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    lower(account.email),
    coalesce(
      nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'full_name'), ''),
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

  if invitation_record.expires_at <= pg_catalog.now() then
    update public.organization_invitations
    set revoked_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = invitation_record.id;

    raise exception 'Invitation expired';
  end if;

  if lower(invitation_record.email) <> signed_in_email then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  select
    case when plan.code = 'enterprise'
      then enterprise.custom_member_limit
      else plan.max_members
    end
  into member_limit
  from public.organization_subscriptions subscription
  join public.subscription_plans plan
    on plan.id = subscription.plan_id
  left join public.enterprise_accounts enterprise
    on enterprise.organization_id = invitation_record.organization_id
  where subscription.organization_id = invitation_record.organization_id
  limit 1;

  if not found then
    select plan.max_members into member_limit
    from public.subscription_plans plan
    where plan.code = 'starter'
    limit 1;
  end if;

  if member_limit is not null then
    select
      (
        select count(*)
        from public.organization_members member
        where member.organization_id = invitation_record.organization_id
          and member.status = 'active'
          and member.user_id <> auth.uid()
      )
      + 1
      +
      (
        select count(*)
        from public.organization_invitations invitation
        where invitation.organization_id = invitation_record.organization_id
          and invitation.id <> invitation_record.id
          and invitation.accepted_at is null
          and invitation.revoked_at is null
          and invitation.expires_at > pg_catalog.now()
      )
    into resulting_reserved_members;

    if resulting_reserved_members > member_limit then
      raise exception
        'USAGE_LIMIT_REACHED:members:%:%',
        resulting_reserved_members - 1,
        member_limit
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.profiles (
    id, email, full_name, organization_id, created_by, created_at, updated_at
  )
  values (
    auth.uid(),
    signed_in_email,
    signed_in_name,
    invitation_record.organization_id,
    auth.uid(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    organization_id = excluded.organization_id,
    created_by = coalesce(public.profiles.created_by, excluded.created_by),
    updated_at = pg_catalog.now();

  insert into public.organization_members (
    organization_id, user_id, role, status, created_by, created_at, updated_at
  )
  values (
    invitation_record.organization_id,
    auth.uid(),
    invitation_record.role,
    'active',
    invitation_record.invited_by,
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    status = 'active',
    created_by = coalesce(public.organization_members.created_by, excluded.created_by),
    updated_at = pg_catalog.now();

  update public.organization_invitations
  set
    accepted_by = auth.uid(),
    accepted_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where id = invitation_record.id
    and accepted_at is null
    and revoked_at is null;

  if not found then
    raise exception 'Invitation was already processed';
  end if;

  return true;
end;
$$;

-- Grants
revoke all on function public.platform_enterprise_directory(text,text,integer,integer) from public, anon;
revoke all on function public.platform_enterprise_detail(uuid) from public, anon;
revoke all on function public.platform_create_enterprise_account(text,text,text) from public, anon;
revoke all on function public.platform_save_enterprise_account(uuid,text,text,text,uuid,text,integer,integer,integer,integer,integer,bigint,integer,integer,integer,text) from public, anon;
revoke all on function public.platform_begin_enterprise_checkout(uuid) from public, anon;
revoke all on function public.platform_finalize_enterprise_checkout(uuid,uuid,text,text,timestamptz) from public, anon;
revoke all on function public.platform_abandon_enterprise_checkout(uuid,uuid) from public, anon;
revoke all on function public.platform_sync_enterprise_payment(uuid,text,text,text,integer,text,timestamptz) from public, anon;
revoke all on function public.platform_activate_enterprise_account(uuid,text) from public, anon;
revoke all on function public.platform_suspend_enterprise_account(uuid,text) from public, anon;

grant execute on function public.platform_enterprise_directory(text,text,integer,integer) to authenticated;
grant execute on function public.platform_enterprise_detail(uuid) to authenticated;
grant execute on function public.platform_create_enterprise_account(text,text,text) to authenticated;
grant execute on function public.platform_save_enterprise_account(uuid,text,text,text,uuid,text,integer,integer,integer,integer,integer,bigint,integer,integer,integer,text) to authenticated;
grant execute on function public.platform_begin_enterprise_checkout(uuid) to authenticated;
grant execute on function public.platform_finalize_enterprise_checkout(uuid,uuid,text,text,timestamptz) to authenticated;
grant execute on function public.platform_abandon_enterprise_checkout(uuid,uuid) to authenticated;
grant execute on function public.platform_sync_enterprise_payment(uuid,text,text,text,integer,text,timestamptz) to authenticated;
grant execute on function public.platform_activate_enterprise_account(uuid,text) to authenticated;
grant execute on function public.platform_suspend_enterprise_account(uuid,text) to authenticated;

revoke all on function public.consume_organization_usage(uuid,text,integer,text) from public;
grant execute on function public.consume_organization_usage(uuid,text,integer,text) to authenticated, service_role;

revoke all on function public.organization_plan_capacity_snapshot(uuid) from public;
grant execute on function public.organization_plan_capacity_snapshot(uuid) to authenticated, service_role;

revoke all on function public.organization_usage_snapshot(uuid) from public;
grant execute on function public.organization_usage_snapshot(uuid) to authenticated, service_role;

revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
