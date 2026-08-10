-- Flowtix production background-worker scheduler
--
-- Replaces the unreliable external GitHub scheduled trigger with Supabase
-- pg_cron + pg_net while preserving the existing secured Vercel worker route.
--
-- Required Vault secrets (add through Supabase Dashboard -> Vault):
--   flowtix_worker_url
--     https://www.flowtix.work/api/cron/process
--
--   flowtix_worker_secret
--     Must exactly match Vercel INTERNAL_JOB_WORKER_SECRET.
--
-- The cron job is safe to install before the Vault values exist. In that
-- state the invocation function returns NULL and makes no HTTP request.
-- Once both Vault secrets exist, the next minute's run becomes active.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault cascade;

create or replace function public.invoke_flowtix_background_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select nullif(btrim(secret.decrypted_secret), '')
  into v_url
  from vault.decrypted_secrets as secret
  where secret.name = 'flowtix_worker_url'
  order by secret.updated_at desc
  limit 1;

  select nullif(btrim(secret.decrypted_secret), '')
  into v_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'flowtix_worker_secret'
  order by secret.updated_at desc
  limit 1;

  if v_url is null or v_secret is null then
    raise warning
      'Flowtix worker cron skipped: Vault secrets flowtix_worker_url and/or flowtix_worker_secret are missing.';
    return null;
  end if;

  if v_url !~ '^https://[^[:space:]]+$' then
    raise exception
      'Flowtix worker URL stored in Vault must be an HTTPS URL.';
  end if;

  select net.http_get(
    url := v_url,
    headers := jsonb_build_object(
      'Accept', 'application/json',
      'Authorization', 'Bearer ' || v_secret,
      'X-Flowtix-Worker-ID', 'supabase-cron'
    ),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all
on function public.invoke_flowtix_background_worker()
from public, anon, authenticated;

grant execute
on function public.invoke_flowtix_background_worker()
to service_role;

comment on function public.invoke_flowtix_background_worker() is
  'Queues one authenticated pg_net request to the Flowtix production background-worker endpoint using secrets stored in Supabase Vault.';

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'flowtix-production-worker'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'flowtix-production-worker',
    '* * * * *',
    $cron$
      select public.invoke_flowtix_background_worker();
    $cron$
  );
end;
$$;

commit;
