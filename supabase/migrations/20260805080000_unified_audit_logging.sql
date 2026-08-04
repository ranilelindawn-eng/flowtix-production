-- Phase 1.8: Unified audit logging
-- Adds structured, tenant-scoped, append-only audit events and database-level
-- mutation logging for critical Flowtix resources.

begin;

alter table public.audit_logs
  add column if not exists actor_membership_id uuid
    references public.organization_members(id) on delete set null,
  add column if not exists target_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists outcome text not null default 'success',
  add column if not exists source text not null default 'application',
  add column if not exists request_id text,
  add column if not exists old_values jsonb,
  add column if not exists new_values jsonb;

do $check$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_outcome_check'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_outcome_check
      check (outcome in ('success', 'failure', 'denied'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_source_check'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_source_check
      check (source in (
        'application',
        'database_trigger',
        'provider_webhook',
        'background_job',
        'system'
      ));
  end if;
end;
$check$;

create index if not exists audit_logs_org_action_created_idx
  on public.audit_logs(organization_id, action, created_at desc);
create index if not exists audit_logs_org_outcome_created_idx
  on public.audit_logs(organization_id, outcome, created_at desc);
create index if not exists audit_logs_request_id_idx
  on public.audit_logs(request_id)
  where request_id is not null;
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs(user_id, created_at desc)
  where user_id is not null;

-- Audit records are append-only for normal application users.
revoke insert, update, delete on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "members read organization audit logs"
  on public.audit_logs;
drop policy if exists audit_logs_select_authorized
  on public.audit_logs;

create policy audit_logs_select_authorized
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as member
    where member.organization_id = audit_logs.organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status::text, 'active') = 'active'
      and member.role::text in ('owner', 'admin', 'manager')
  )
);

create or replace function public.audit_sanitize_json(value jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select coalesce(value, '{}'::jsonb)
    - array[
      'access_token',
      'refresh_token',
      'authorization',
      'client_secret',
      'api_key',
      'apiKey',
      'password',
      'secret',
      'token',
      'encrypted_credentials'
    ];
$function$;

revoke all on function public.audit_sanitize_json(jsonb) from public;
grant execute on function public.audit_sanitize_json(jsonb)
  to authenticated, service_role;

create or replace function public.log_audit_event_v2(
  p_action text,
  p_resource_type text default null,
  p_resource_id text default null,
  p_organization_id uuid default null,
  p_target_user_id uuid default null,
  p_outcome text default 'success',
  p_source text default 'application',
  p_metadata jsonb default '{}'::jsonb,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid := p_organization_id;
  v_membership_id uuid;
  v_audit_id uuid;
begin
  if nullif(trim(p_action), '') is null then
    raise exception 'Audit action is required';
  end if;

  if p_outcome not in ('success', 'failure', 'denied') then
    raise exception 'Invalid audit outcome';
  end if;

  if p_source not in (
    'application',
    'database_trigger',
    'provider_webhook',
    'background_job',
    'system'
  ) then
    raise exception 'Invalid audit source';
  end if;

  if v_user_id is not null then
    if v_organization_id is null then
      select member.organization_id, member.id
      into v_organization_id, v_membership_id
      from public.organization_members as member
      left join public.profiles as profile
        on profile.id = v_user_id
      where member.user_id = v_user_id
        and coalesce(member.status::text, 'active') = 'active'
      order by
        case
          when member.organization_id = profile.organization_id then 0
          else 1
        end,
        member.created_at asc
      limit 1;
    else
      select member.id
      into v_membership_id
      from public.organization_members as member
      where member.organization_id = v_organization_id
        and member.user_id = v_user_id
        and coalesce(member.status::text, 'active') = 'active'
      limit 1;

      if v_membership_id is null then
        raise exception 'The current user is not an active member of the audit organization';
      end if;
    end if;
  end if;

  insert into public.audit_logs (
    organization_id,
    user_id,
    actor_membership_id,
    target_user_id,
    action,
    resource_type,
    resource_id,
    outcome,
    source,
    request_id,
    metadata,
    old_values,
    new_values,
    ip_address,
    user_agent
  )
  values (
    v_organization_id,
    v_user_id,
    v_membership_id,
    p_target_user_id,
    trim(p_action),
    nullif(trim(coalesce(p_resource_type, '')), ''),
    nullif(trim(coalesce(p_resource_id, '')), ''),
    p_outcome,
    p_source,
    nullif(trim(coalesce(p_request_id, '')), ''),
    public.audit_sanitize_json(p_metadata),
    case when p_old_values is null then null
      else public.audit_sanitize_json(p_old_values) end,
    case when p_new_values is null then null
      else public.audit_sanitize_json(p_new_values) end,
    p_ip_address,
    p_user_agent
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$function$;

revoke all on function public.log_audit_event_v2(
  text, text, text, uuid, uuid, text, text, jsonb, jsonb, jsonb, inet, text, text
) from public;
grant execute on function public.log_audit_event_v2(
  text, text, text, uuid, uuid, text, text, jsonb, jsonb, jsonb, inet, text, text
) to authenticated, service_role;

create or replace function public.audit_critical_table_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old, '{}'::jsonb);
  v_organization_id uuid;
  v_resource_id text;
  v_actor_user_id uuid := auth.uid();
  v_actor_membership_id uuid;
  v_request_id text;
  v_headers jsonb;
begin
  begin
    v_organization_id := nullif(v_row ->> 'organization_id', '')::uuid;
  exception when invalid_text_representation then
    v_organization_id := null;
  end;

  if v_organization_id is null and tg_table_name = 'organizations' then
    begin
      v_organization_id := nullif(v_row ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      v_organization_id := null;
    end;
  end if;

  v_resource_id := nullif(v_row ->> 'id', '');

  if v_actor_user_id is not null and v_organization_id is not null then
    select member.id
    into v_actor_membership_id
    from public.organization_members as member
    where member.organization_id = v_organization_id
      and member.user_id = v_actor_user_id
      and coalesce(member.status::text, 'active') = 'active'
    limit 1;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_request_id := coalesce(
      v_headers ->> 'x-request-id',
      v_headers ->> 'x-vercel-id'
    );
  exception when others then
    v_request_id := null;
  end;

  insert into public.audit_logs (
    organization_id,
    user_id,
    actor_membership_id,
    target_user_id,
    action,
    resource_type,
    resource_id,
    outcome,
    source,
    request_id,
    metadata,
    old_values,
    new_values
  )
  values (
    v_organization_id,
    v_actor_user_id,
    v_actor_membership_id,
    case
      when tg_table_name = 'organization_members' then
        nullif(v_row ->> 'user_id', '')::uuid
      else null
    end,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_resource_id,
    'success',
    'database_trigger',
    v_request_id,
    jsonb_build_object('database_operation', tg_op),
    case when v_old is null then null
      else public.audit_sanitize_json(v_old) end,
    case when v_new is null then null
      else public.audit_sanitize_json(v_new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

revoke all on function public.audit_critical_table_mutation() from public;

-- Install append-only audit triggers on critical business and security tables.
do $triggers$
declare
  table_name text;
  trigger_name text;
  audited_tables text[] := array[
    'organizations',
    'organization_members',
    'organization_invitations',
    'organization_subscriptions',
    'organization_integrations',
    'organization_phone_numbers',
    'api_keys',
    'contacts',
    'companies',
    'opportunities',
    'contact_tasks',
    'calendar_events',
    'calls',
    'campaigns',
    'background_jobs'
  ];
begin
  foreach table_name in array audited_tables loop
    if to_regclass('public.' || table_name) is not null then
      trigger_name := 'audit_' || table_name || '_mutation';
      execute format(
        'drop trigger if exists %I on public.%I',
        trigger_name,
        table_name
      );
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_critical_table_mutation()',
        trigger_name,
        table_name
      );
    end if;
  end loop;
end;
$triggers$;

commit;
