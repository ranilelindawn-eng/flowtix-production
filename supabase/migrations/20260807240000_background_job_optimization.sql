begin;

alter table public.background_jobs
  add column if not exists partition_key text;

create index if not exists background_jobs_claim_idx
  on public.background_jobs (
    queue,
    status,
    priority,
    scheduled_at,
    created_at
  )
  where status in ('queued', 'scheduled', 'retrying');

create index if not exists background_jobs_retry_claim_idx
  on public.background_jobs (
    queue,
    status,
    priority,
    next_retry_at,
    created_at
  )
  where status = 'retrying';

create index if not exists background_jobs_lease_idx
  on public.background_jobs (status, lock_expires_at)
  where status = 'processing';

create or replace function public.requeue_stale_background_jobs(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with stale as (
    select id
    from public.background_jobs
    where status = 'processing'
      and lock_expires_at is not null
      and lock_expires_at < now()
    order by lock_expires_at
    limit greatest(1, least(p_limit, 1000))
    for update skip locked
  )
  update public.background_jobs as jobs
  set
    status = 'retrying',
    next_retry_at = now(),
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    heartbeat_at = null,
    last_error_code = coalesce(last_error_code, 'lease_expired'),
    last_error_message = coalesce(
      last_error_message,
      'Lease expired and job was requeued.'
    ),
    updated_at = now()
  from stale
  where jobs.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.requeue_stale_background_jobs(integer)
  from public, anon, authenticated;

grant execute on function public.requeue_stale_background_jobs(integer)
  to service_role;

commit;
