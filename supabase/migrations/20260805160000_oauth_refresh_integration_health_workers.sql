begin;

alter table public.organization_integrations
  add column if not exists token_expires_at timestamptz,
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists refresh_status text not null default 'idle',
  add column if not exists refresh_lock_until timestamptz,
  add column if not exists refresh_locked_by text,
  add column if not exists health_status text not null default 'unknown',
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists next_health_check_at timestamptz not null default now(),
  add column if not exists last_health_check_at timestamptz,
  add column if not exists reauthorization_required boolean not null default false;

alter table public.organization_integrations
  drop constraint if exists organization_integrations_refresh_status_check;

alter table public.organization_integrations
  add constraint organization_integrations_refresh_status_check
  check (
    refresh_status in (
      'idle',
      'queued',
      'refreshing',
      'failed'
    )
  );

alter table public.organization_integrations
  drop constraint if exists organization_integrations_health_status_check;

alter table public.organization_integrations
  add constraint organization_integrations_health_status_check
  check (
    health_status in (
      'unknown',
      'healthy',
      'degraded',
      'unhealthy',
      'reauthorization_required'
    )
  );

alter table public.organization_integrations
  drop constraint if exists organization_integrations_consecutive_failures_check;

alter table public.organization_integrations
  add constraint organization_integrations_consecutive_failures_check
  check (consecutive_failures >= 0);

create index if not exists organization_integrations_maintenance_due_idx
on public.organization_integrations (
  enabled,
  status,
  next_health_check_at,
  token_expires_at
)
where enabled = true;

create table if not exists public.integration_health_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  integration_id uuid not null
    references public.organization_integrations(id)
    on delete cascade,
  provider text not null,
  check_type text not null
    check (check_type in ('refresh','health')),
  status text not null
    check (status in ('passed','failed')),
  latency_ms integer
    check (latency_ms is null or latency_ms >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create index if not exists integration_health_checks_integration_idx
on public.integration_health_checks (
  integration_id,
  checked_at desc
);

create index if not exists integration_health_checks_org_idx
on public.integration_health_checks (
  organization_id,
  checked_at desc
);

alter table public.integration_health_checks
  enable row level security;

drop policy if exists integration_health_checks_select
  on public.integration_health_checks;

create policy integration_health_checks_select
on public.integration_health_checks
for select to authenticated
using (public.is_org_member(organization_id));

revoke insert, update, delete
on public.integration_health_checks
from authenticated;

grant select
on public.integration_health_checks
to authenticated;

grant all
on public.integration_health_checks
to service_role;

create or replace function public.claim_integration_maintenance(
  p_integration_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_updated integer;
begin
  update public.organization_integrations
  set
    refresh_status = 'refreshing',
    refresh_locked_by = p_worker_id,
    refresh_lock_until =
      now() + make_interval(
        secs => greatest(
          30,
          least(coalesce(p_lease_seconds, 180), 900)
        )
      ),
    updated_at = now()
  where id = p_integration_id
    and enabled = true
    and (
      refresh_lock_until is null
      or refresh_lock_until < now()
    );

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all
on function public.claim_integration_maintenance(
  uuid,
  text,
  integer
)
from public, anon, authenticated;

grant execute
on function public.claim_integration_maintenance(
  uuid,
  text,
  integer
)
to service_role;

create or replace function
public.enqueue_due_integration_maintenance_jobs(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row record;
  v_refresh integer := 0;
  v_health integer := 0;
  v_skipped integer := 0;
  v_operation text;
  v_idempotency text;
begin
  for v_row in
    select
      integration.id,
      integration.organization_id,
      integration.provider,
      integration.token_expires_at,
      integration.next_health_check_at,
      integration.refresh_lock_until
    from public.organization_integrations as integration
    where integration.enabled = true
      and integration.status in (
        'connected',
        'configured',
        'error'
      )
      and integration.provider in (
        'gmail',
        'google-calendar',
        'outlook',
        'microsoft-teams',
        'zoom',
        'slack'
      )
      and (
        integration.next_health_check_at <= now()
        or integration.token_expires_at is null
        or integration.token_expires_at <=
          now() + interval '15 minutes'
      )
      and (
        integration.refresh_lock_until is null
        or integration.refresh_lock_until < now()
      )
    order by
      integration.token_expires_at nulls first,
      integration.next_health_check_at asc
    limit greatest(
      1,
      least(coalesce(p_limit, 100), 500)
    )
    for update skip locked
  loop
    v_operation :=
      case
        when v_row.token_expires_at is null
          or v_row.token_expires_at <=
            now() + interval '15 minutes'
        then 'refresh'
        else 'health'
      end;

    v_idempotency :=
      'integration-maintenance:' ||
      v_row.id::text || ':' ||
      v_operation || ':' ||
      to_char(now(), 'YYYYMMDDHH24MI');

    insert into public.background_jobs (
      organization_id,
      queue,
      job_type,
      payload,
      status,
      priority,
      scheduled_at,
      max_attempts,
      idempotency_key
    )
    values (
      v_row.organization_id,
      'oauth_refresh',
      case
        when v_operation = 'refresh'
          then 'integration.refresh'
        else 'integration.health_check'
      end,
      jsonb_build_object(
        'organizationId',
        v_row.organization_id,
        'integrationId',
        v_row.id,
        'provider',
        v_row.provider,
        'operation',
        v_operation
      ),
      'queued',
      80,
      now(),
      6,
      v_idempotency
    )
    on conflict (
      organization_id,
      idempotency_key
    )
    where idempotency_key is not null
    do nothing;

    if found then
      update public.organization_integrations
      set
        refresh_status = 'queued',
        next_health_check_at =
          now() + interval '15 minutes',
        updated_at = now()
      where id = v_row.id;

      if v_operation = 'refresh' then
        v_refresh := v_refresh + 1;
      else
        v_health := v_health + 1;
      end if;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'refresh_scheduled',
    v_refresh,
    'health_scheduled',
    v_health,
    'skipped',
    v_skipped
  );
end;
$$;

revoke all
on function
  public.enqueue_due_integration_maintenance_jobs(integer)
from public, anon, authenticated;

grant execute
on function
  public.enqueue_due_integration_maintenance_jobs(integer)
to service_role;

commit;
