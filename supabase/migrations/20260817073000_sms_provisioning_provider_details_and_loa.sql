begin;

-- Extends the already-deployed existing-company SMS Hosted Messaging workflow.
-- This migration is additive: it preserves existing provisioning requests and
-- stores the carrier account PIN in a service-role-only encrypted secret table.

alter table public.organization_sms_sender_requests
  add column if not exists provider_account_number text,
  add column if not exists account_type text,
  add column if not exists authorized_name_on_account text,
  add column if not exists billing_phone_number text,
  add column if not exists end_user_name text,
  add column if not exists phone_service_address text,
  add column if not exists tcr_campaign_id text;

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_account_type_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_account_type_check
  check (account_type is null or account_type in ('business', 'residential'));

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_provider_account_number_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_provider_account_number_check
  check (
    provider_account_number is null
    or char_length(provider_account_number) between 1 and 120
  );

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_authorized_name_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_authorized_name_check
  check (
    authorized_name_on_account is null
    or char_length(authorized_name_on_account) between 2 and 160
  );

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_billing_phone_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_billing_phone_check
  check (
    billing_phone_number is null
    or char_length(billing_phone_number) between 7 and 40
  );

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_end_user_name_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_end_user_name_check
  check (
    end_user_name is null
    or char_length(end_user_name) between 2 and 200
  );

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_service_address_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_service_address_check
  check (
    phone_service_address is null
    or char_length(phone_service_address) between 5 and 500
  );

alter table public.organization_sms_sender_requests
  drop constraint if exists organization_sms_sender_requests_tcr_campaign_check;
alter table public.organization_sms_sender_requests
  add constraint organization_sms_sender_requests_tcr_campaign_check
  check (
    tcr_campaign_id is null
    or char_length(tcr_campaign_id) between 1 and 80
  );

create table if not exists public.organization_sms_sender_request_secrets (
  request_id uuid primary key
    references public.organization_sms_sender_requests(id) on delete cascade,
  encrypted_credentials text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_organization_sms_sender_request_secret()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

drop trigger if exists organization_sms_sender_request_secrets_touch_updated_at
  on public.organization_sms_sender_request_secrets;
create trigger organization_sms_sender_request_secrets_touch_updated_at
before update on public.organization_sms_sender_request_secrets
for each row execute function public.touch_organization_sms_sender_request_secret();

alter table public.organization_sms_sender_request_secrets enable row level security;
revoke all on table public.organization_sms_sender_request_secrets
  from public, anon, authenticated;
grant all on table public.organization_sms_sender_request_secrets to service_role;

comment on table public.organization_sms_sender_request_secrets is
  'Service-role-only encrypted carrier credentials for Hosted Messaging provisioning. Never expose to customer workspace clients.';

commit;
