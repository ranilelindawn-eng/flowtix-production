create table if not exists public.worker_execution_logs (
  id uuid primary key default gen_random_uuid(),

  worker_id text not null,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  claimed_jobs integer not null default 0,
  completed_jobs integer not null default 0,
  retried_jobs integer not null default 0,
  failed_jobs integer not null default 0,
  dead_letter_jobs integer not null default 0,

  duration_ms integer,

  status text not null default 'running'
    check (
      status in (
        'running',
        'completed',
        'failed'
      )
    ),

  error_message text,

  created_at timestamptz not null default now()
);


create index if not exists worker_execution_logs_created_at_idx
on public.worker_execution_logs(created_at desc);


create index if not exists worker_execution_logs_worker_id_idx
on public.worker_execution_logs(worker_id);


alter table public.worker_execution_logs enable row level security;


create policy "Service role manages worker execution logs"
on public.worker_execution_logs
for all
using (
  auth.role() = 'service_role'
)
with check (
  auth.role() = 'service_role'
);