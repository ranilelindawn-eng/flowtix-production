begin;

alter table public.communication_messages
  add column if not exists provider_status text,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_message text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists last_provider_event_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz;

create table if not exists public.communication_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  communication_message_id uuid not null
    references public.communication_messages(id)
    on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_message_id text not null,
  provider_status text,
  normalized_status text not null
    check (
      normalized_status in (
        'queued',
        'sent',
        'delivered',
        'delayed',
        'failed'
      )
    ),
  event_at timestamptz not null,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists communication_delivery_events_message_idx
  on public.communication_delivery_events (
    communication_message_id,
    event_at desc
  );

create index if not exists communication_delivery_events_org_idx
  on public.communication_delivery_events (
    organization_id,
    received_at desc
  );

alter table public.communication_delivery_events
  enable row level security;

drop policy if exists communication_delivery_events_select
  on public.communication_delivery_events;

create policy communication_delivery_events_select
on public.communication_delivery_events
for select to authenticated
using (public.is_org_member(organization_id));

revoke insert, update, delete
on public.communication_delivery_events
from anon, authenticated;

grant select
on public.communication_delivery_events
to authenticated;

grant all
on public.communication_delivery_events
to service_role;

create or replace function public.apply_communication_delivery_event(
  p_provider text,
  p_event_id text,
  p_message_id uuid,
  p_provider_message_id text,
  p_provider_status text,
  p_normalized_status text,
  p_event_at timestamptz,
  p_error_code text,
  p_error_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.communication_messages;
  v_existing_event uuid;
  v_current_rank integer;
  v_new_rank integer;
  v_next_status text;
  v_applied boolean := false;
begin
  if p_provider is null
    or btrim(p_provider) = ''
    or p_event_id is null
    or btrim(p_event_id) = ''
    or p_provider_message_id is null
    or btrim(p_provider_message_id) = ''
    or p_normalized_status not in (
      'queued',
      'sent',
      'delivered',
      'delayed',
      'failed'
    )
  then
    raise exception 'Invalid communication delivery event.'
      using errcode = '22023';
  end if;

  if p_message_id is not null then
    select *
    into v_message
    from public.communication_messages
    where id = p_message_id
    for update;
  else
    select *
    into v_message
    from public.communication_messages
    where provider = p_provider
      and provider_message_id = p_provider_message_id
    for update;
  end if;

  if v_message.id is null then
    return jsonb_build_object(
      'applied',
      false,
      'ignored',
      true,
      'reason',
      'MESSAGE_NOT_FOUND'
    );
  end if;

  if v_message.provider_message_id is not null
    and v_message.provider_message_id <> p_provider_message_id
  then
    raise exception 'Provider message ID does not match.'
      using errcode = '22023';
  end if;

  insert into public.communication_delivery_events (
    organization_id,
    communication_message_id,
    provider,
    provider_event_id,
    provider_message_id,
    provider_status,
    normalized_status,
    event_at,
    error_code,
    error_message,
    metadata
  )
  values (
    v_message.organization_id,
    v_message.id,
    p_provider,
    p_event_id,
    p_provider_message_id,
    p_provider_status,
    p_normalized_status,
    coalesce(p_event_at, now()),
    p_error_code,
    p_error_message,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id)
  do nothing
  returning id into v_existing_event;

  if v_existing_event is null then
    return jsonb_build_object(
      'applied',
      false,
      'duplicate',
      true,
      'message_id',
      v_message.id
    );
  end if;

  v_current_rank :=
    case v_message.status
      when 'delivered' then 40
      when 'sent' then 30
      when 'processing' then 20
      when 'queued' then 10
      when 'failed' then 5
      when 'cancelled' then 50
      else 0
    end;

  v_new_rank :=
    case p_normalized_status
      when 'delivered' then 40
      when 'sent' then 30
      when 'delayed' then 25
      when 'queued' then 10
      when 'failed' then 5
      else 0
    end;

  v_next_status :=
    case p_normalized_status
      when 'delivered' then 'delivered'
      when 'sent' then 'sent'
      when 'delayed' then
        case
          when v_message.status in ('sent','delivered')
            then v_message.status
          else 'sent'
        end
      when 'queued' then
        case
          when v_message.status in ('sent','delivered')
            then v_message.status
          else 'queued'
        end
      when 'failed' then
        case
          when v_message.status = 'delivered'
            then 'delivered'
          else 'failed'
        end
      else v_message.status
    end;

  if v_message.status <> 'cancelled'
    and (
      v_new_rank >= v_current_rank
      or p_normalized_status = 'failed'
    )
  then
    update public.communication_messages
    set
      provider = coalesce(provider, p_provider),
      provider_message_id = coalesce(
        provider_message_id,
        p_provider_message_id
      ),
      provider_status = p_provider_status,
      status = v_next_status,
      status_updated_at = now(),
      last_provider_event_at = greatest(
        coalesce(last_provider_event_at, '-infinity'::timestamptz),
        coalesce(p_event_at, now())
      ),
      delivered_at =
        case
          when p_normalized_status = 'delivered'
            then coalesce(delivered_at, p_event_at, now())
          else delivered_at
        end,
      failed_at =
        case
          when p_normalized_status = 'failed'
            and v_next_status = 'failed'
            then coalesce(failed_at, p_event_at, now())
          else failed_at
        end,
      provider_error_code =
        case
          when p_normalized_status = 'failed'
            then p_error_code
          else null
        end,
      provider_error_message =
        case
          when p_normalized_status = 'failed'
            then p_error_message
          else null
        end,
      error_message =
        case
          when p_normalized_status = 'failed'
            and v_next_status = 'failed'
            then coalesce(
              p_error_message,
              'The provider reported a delivery failure.'
            )
          when p_normalized_status in ('sent','delivered')
            then null
          else error_message
        end,
      updated_at = now()
    where id = v_message.id;

    v_applied := true;
  end if;

  if v_message.source = 'sequence'
    and v_message.source_record_id is not null
  then
    if p_normalized_status = 'delivered' then
      update public.sequence_step_executions
      set
        status = 'completed',
        provider_resource_type = 'communication_message',
        provider_resource_id = v_message.id::text,
        completed_at = coalesce(
          completed_at,
          p_event_at,
          now()
        ),
        error_code = null,
        error_message = null,
        updated_at = now()
      where id = v_message.source_record_id
        and organization_id = v_message.organization_id
        and status in ('queued','processing','dispatched');
    elsif p_normalized_status = 'failed' then
      update public.sequence_step_executions
      set
        status = 'failed',
        provider_resource_type = 'communication_message',
        provider_resource_id = v_message.id::text,
        failed_at = coalesce(failed_at, p_event_at, now()),
        error_code = p_error_code,
        error_message = coalesce(
          p_error_message,
          'Provider delivery failed.'
        ),
        updated_at = now()
      where id = v_message.source_record_id
        and organization_id = v_message.organization_id
        and status <> 'completed';
    end if;
  end if;

  return jsonb_build_object(
    'applied',
    v_applied,
    'duplicate',
    false,
    'message_id',
    v_message.id,
    'status',
    v_next_status
  );
end;
$$;

revoke all
on function public.apply_communication_delivery_event(
  text,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.apply_communication_delivery_event(
  text,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  jsonb
)
to service_role;

commit;
