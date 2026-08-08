-- Flowtix Automation 1.2: Post-call automation configuration model.
-- Adds one organization-scoped configuration record for durable post-call
-- email/SMS follow-up. Delivery, trigger orchestration, permissions expansion,
-- template rendering, and AI generation are implemented in later phases.

begin;

create table if not exists public.post_call_automation_configs (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,

  enabled boolean not null default false,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,

  -- Flowtix's current public.call_status enum contains:
  -- completed, failed, scheduled, cancelled.
  -- Post-call automation only permits terminal states here.
  trigger_statuses public.call_status[] not null
    default array['completed'::public.call_status],

  delay_seconds integer not null default 0,

  email_subject text,
  email_body text,
  sms_body text,

  -- Sender resolution deliberately follows existing organization-owned
  -- integrations instead of storing provider credentials in this table.
  -- Email is resolved from the organization's connected email integration.
  -- SMS is resolved from the organization's default SMS-capable phone number.
  email_sender_mode text not null default 'connected_integration'
    check (email_sender_mode = 'connected_integration'),
  sms_sender_mode text not null default 'default_organization_number'
    check (sms_sender_mode = 'default_organization_number'),

  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint post_call_automation_trigger_statuses_not_empty
    check (cardinality(trigger_statuses) > 0),
  constraint post_call_automation_terminal_statuses_only
    check (
      trigger_statuses <@ array[
        'completed'::public.call_status,
        'failed'::public.call_status,
        'cancelled'::public.call_status
      ]
    ),
  constraint post_call_automation_delay_range
    check (delay_seconds between 0 and 604800),
  constraint post_call_automation_channel_required_when_enabled
    check (not enabled or email_enabled or sms_enabled),
  constraint post_call_automation_email_content_required
    check (
      not email_enabled
      or (
        nullif(btrim(coalesce(email_subject, '')), '') is not null
        and nullif(btrim(coalesce(email_body, '')), '') is not null
      )
    ),
  constraint post_call_automation_sms_content_required
    check (
      not sms_enabled
      or nullif(btrim(coalesce(sms_body, '')), '') is not null
    )
);

comment on table public.post_call_automation_configs is
  'Organization-scoped saved configuration for post-call email/SMS follow-up automation.';

comment on column public.post_call_automation_configs.email_sender_mode is
  'Sender is resolved from the organization subscriber''s connected email integration.';

comment on column public.post_call_automation_configs.sms_sender_mode is
  'Sender is resolved from the organization''s default SMS-capable Flowtix phone number.';

create index if not exists post_call_automation_configs_enabled_idx
  on public.post_call_automation_configs (organization_id)
  where enabled;

create or replace function public.touch_post_call_automation_config_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_post_call_automation_config_updated_at
  on public.post_call_automation_configs;

create trigger touch_post_call_automation_config_updated_at
before update on public.post_call_automation_configs
for each row
execute function public.touch_post_call_automation_config_updated_at();

-- Existing organizations receive a disabled configuration row. No messages can
-- be sent merely by applying this migration.
insert into public.post_call_automation_configs (organization_id)
select organization.id
from public.organizations as organization
on conflict (organization_id) do nothing;

-- Keep future organizations initialized without coupling organization creation
-- to application code.
create or replace function public.initialize_post_call_automation_config()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.post_call_automation_configs (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_post_call_automation_config
  on public.organizations;

create trigger initialize_post_call_automation_config
after insert on public.organizations
for each row
execute function public.initialize_post_call_automation_config();

alter table public.post_call_automation_configs enable row level security;

drop policy if exists post_call_automation_configs_select
  on public.post_call_automation_configs;

create policy post_call_automation_configs_select
on public.post_call_automation_configs
for select to authenticated
using (public.is_org_member(organization_id));

-- Automation 1.2 deliberately keeps writes at the same Owner/Admin database
-- boundary as the existing automation_controls table. Automation 1.4 will add
-- the narrowly-scoped authorized-manager permission without granting managers
-- broad automation administration rights.
drop policy if exists post_call_automation_configs_write
  on public.post_call_automation_configs;

create policy post_call_automation_configs_write
on public.post_call_automation_configs
for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

grant select, insert, update, delete
on public.post_call_automation_configs
to authenticated;

grant all
on public.post_call_automation_configs
to service_role;

revoke all
on function public.touch_post_call_automation_config_updated_at()
from public, anon;

grant execute
on function public.touch_post_call_automation_config_updated_at()
to authenticated, service_role;

revoke all
on function public.initialize_post_call_automation_config()
from public, anon, authenticated;

grant execute
on function public.initialize_post_call_automation_config()
to service_role;

commit;
