-- Flowtix — Tenant deletion trigger hardening
--
-- Prevents tenant deletion / organization cascades from failing when AFTER DELETE
-- business triggers attempt to create new rows that still reference the organization
-- (or another parent row) that is being deleted.
--
-- Design:
--   * Keep all foreign keys and cascade behavior intact.
--   * Keep normal audit/timeline/history behavior intact while the organization exists.
--   * Suppress only side-effect writes that would target an organization that no longer
--     exists during a tenant cascade.
--   * Do not disable triggers globally and do not weaken tenant isolation.

begin;

-- -----------------------------------------------------------------------------
-- 1. Unified audit logging
--
-- audit_logs.organization_id references organizations(id) ON DELETE CASCADE.
-- An AFTER DELETE trigger on organizations (or on a row being deleted as part of the
-- organization cascade) cannot create a new tenant-scoped audit row after the parent
-- organization has disappeared. Such a row would immediately be invalid and, even if
-- it could be created, would belong to data that is intentionally being purged.
-- -----------------------------------------------------------------------------

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

  -- During an organization DELETE, the AFTER trigger runs when the tenant row is no
  -- longer a valid FK target. Cascaded child DELETE triggers can observe the same
  -- state. Do not manufacture orphaned tenant-scoped audit rows in that situation.
  if v_organization_id is not null
     and not exists (
       select 1
       from public.organizations as organization_row
       where organization_row.id = v_organization_id
     ) then
    return case when tg_op = 'DELETE' then old else new end;
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

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function public.audit_critical_table_mutation() from public;

-- -----------------------------------------------------------------------------
-- 2. CRM timeline writer
--
-- Centralize the tenant-existence guard here so trigger and non-trigger callers share
-- the same protection. A concurrent tenant deletion is handled defensively as well:
-- only an FK failure caused by the organization disappearing is suppressed; unrelated
-- FK violations are re-raised normally.
-- -----------------------------------------------------------------------------

create or replace function public.write_crm_timeline_event(
  p_organization_id uuid,
  p_contact_id uuid,
  p_company_id uuid,
  p_opportunity_id uuid,
  p_event_type text,
  p_event_action text,
  p_source_table text,
  p_source_id uuid,
  p_event_key text,
  p_title text,
  p_description text,
  p_occurred_at timestamptz,
  p_actor_user_id uuid,
  p_owner_membership_id uuid,
  p_visibility text,
  p_payload jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  result_id uuid;
begin
  if p_organization_id is null or p_source_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.organizations as organization_row
    where organization_row.id = p_organization_id
  ) then
    return null;
  end if;

  begin
    insert into public.crm_timeline_events (
      organization_id,
      contact_id,
      company_id,
      opportunity_id,
      event_type,
      event_action,
      source_table,
      source_id,
      event_key,
      title,
      description,
      occurred_at,
      actor_user_id,
      owner_membership_id,
      visibility,
      payload,
      metadata
    ) values (
      p_organization_id,
      p_contact_id,
      p_company_id,
      p_opportunity_id,
      p_event_type,
      p_event_action,
      p_source_table,
      p_source_id,
      p_event_key,
      left(coalesce(nullif(p_title, ''), 'CRM activity'), 300),
      p_description,
      coalesce(p_occurred_at, now()),
      p_actor_user_id,
      p_owner_membership_id,
      case
        when p_visibility in ('private', 'team', 'organization') then p_visibility
        else 'organization'
      end,
      coalesce(p_payload, '{}'::jsonb),
      coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict (organization_id, event_key) do nothing
    returning id into result_id;
  exception
    when foreign_key_violation then
      -- Suppress only the tenant-deletion race. A bad contact/company/opportunity/
      -- membership reference while the tenant still exists remains a real error.
      if not exists (
        select 1
        from public.organizations as organization_row
        where organization_row.id = p_organization_id
      ) then
        return null;
      end if;
      raise;
  end;

  return result_id;
end;
$function$;

revoke all on function public.write_crm_timeline_event(
  uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, text,
  timestamptz, uuid, uuid, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.write_crm_timeline_event(
  uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, text,
  timestamptz, uuid, uuid, text, jsonb, jsonb
) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Tag assignment history
--
-- entity_tags can be deleted because the organization or the tag is being deleted.
-- In the first case there is no tenant history to preserve. In the second case, keep
-- the removal history but use NULL for tag_id once the tag itself is no longer present
-- (the history FK already allows NULL / ON DELETE SET NULL).
-- -----------------------------------------------------------------------------

create or replace function public.capture_tag_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_tag_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.tag_assignment_history (
      organization_id,
      tag_id,
      entity_type,
      entity_id,
      action,
      actor_user_id,
      source,
      metadata
    ) values (
      new.organization_id,
      new.tag_id,
      new.entity_type,
      new.entity_id,
      'assigned',
      coalesce(new.assigned_by, auth.uid()),
      new.source,
      new.metadata
    );

    return new;
  end if;

  -- A cascaded tenant purge should not create fresh tenant-scoped history rows.
  if old.organization_id is null
     or not exists (
       select 1
       from public.organizations as organization_row
       where organization_row.id = old.organization_id
     ) then
    return old;
  end if;

  select tag_row.id
  into v_tag_id
  from public.tags as tag_row
  where tag_row.id = old.tag_id
    and tag_row.organization_id = old.organization_id
  limit 1;

  insert into public.tag_assignment_history (
    organization_id,
    tag_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    source,
    metadata
  ) values (
    old.organization_id,
    v_tag_id,
    old.entity_type,
    old.entity_id,
    'removed',
    auth.uid(),
    old.source,
    old.metadata
  );

  return old;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Calendar event history
--
-- calendar_event_history.calendar_event_id is NOT NULL and references the source
-- calendar event ON DELETE CASCADE. An AFTER DELETE history row can therefore never
-- survive a calendar-event deletion and can itself violate the FK. Ordinary INSERT /
-- UPDATE history remains unchanged; deletes are already covered by unified audit and
-- the CRM timeline while the tenant exists.
-- -----------------------------------------------------------------------------

create or replace function public.record_calendar_event_history()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  action_name text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Defensive tenant-cascade guard for INSERT/UPDATE edge cases.
  if new.organization_id is null
     or not exists (
       select 1
       from public.organizations as organization_row
       where organization_row.id = new.organization_id
     ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    action_name := 'created';
  elsif old.status is distinct from new.status then
    action_name := case
      when new.status = 'cancelled' then 'cancelled'
      else 'status_changed'
    end;
  elsif old.starts_at is distinct from new.starts_at
     or old.ends_at is distinct from new.ends_at then
    action_name := 'rescheduled';
  else
    action_name := 'updated';
  end if;

  insert into public.calendar_event_history (
    organization_id,
    calendar_event_id,
    action,
    previous_state,
    new_state,
    actor_user_id
  ) values (
    new.organization_id,
    new.id,
    action_name,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    auth.uid()
  );

  return new;
end;
$function$;

notify pgrst, 'reload schema';

commit;
