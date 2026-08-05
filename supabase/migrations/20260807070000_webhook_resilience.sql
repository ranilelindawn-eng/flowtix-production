begin;
alter table public.billing_payment_events
 add column if not exists processing_attempts integer not null default 0,
 add column if not exists next_retry_at timestamptz,
 add column if not exists last_error_at timestamptz,
 add column if not exists dead_lettered_at timestamptz,
 add column if not exists replayed_at timestamptz,
 add column if not exists replayed_by uuid references auth.users(id) on delete set null;
create index if not exists billing_payment_events_retry_idx on public.billing_payment_events(next_retry_at) where status='failed' and dead_lettered_at is null;
create table if not exists public.billing_webhook_attempts(
 id uuid primary key default gen_random_uuid(), billing_event_id uuid not null references public.billing_payment_events(id) on delete cascade,
 attempt_number integer not null, outcome text not null check(outcome in('processed','ignored','failed')),
 error_message text, duration_ms integer, created_at timestamptz not null default now(), unique(billing_event_id,attempt_number)
);
alter table public.billing_webhook_attempts enable row level security;
revoke all on public.billing_webhook_attempts from anon;
revoke insert,update,delete on public.billing_webhook_attempts from authenticated;
grant select on public.billing_webhook_attempts to authenticated;
create policy billing_webhook_attempts_admins on public.billing_webhook_attempts for select to authenticated using(
 exists(select 1 from public.billing_payment_events e join public.organization_members m on m.organization_id=e.organization_id
 where e.id=billing_webhook_attempts.billing_event_id and m.user_id=auth.uid() and m.role in('owner','admin') and coalesce(m.status,'active')='active')
);
create or replace function public.mark_billing_webhook_attempt(p_event_id text,p_outcome text,p_error text default null,p_duration_ms integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.billing_payment_events%rowtype; n integer;
begin
 select * into v from public.billing_payment_events where provider='paymongo' and provider_event_id=p_event_id for update;
 if not found then raise exception 'Billing event not found.'; end if;
 n:=v.processing_attempts+1;
 update public.billing_payment_events set processing_attempts=n,
   status=case when p_outcome='failed' then 'failed' else p_outcome end,
   next_retry_at=case when p_outcome='failed' and n<8 then now()+make_interval(secs=>least(3600,30*power(2,n-1)::integer)) else null end,
   last_error_at=case when p_outcome='failed' then now() else last_error_at end,
   dead_lettered_at=case when p_outcome='failed' and n>=8 then now() else dead_lettered_at end,
   processed_at=case when p_outcome in('processed','ignored') then now() else processed_at end
 where id=v.id;
 insert into public.billing_webhook_attempts(billing_event_id,attempt_number,outcome,error_message,duration_ms)
 values(v.id,n,p_outcome,p_error,p_duration_ms) on conflict do nothing;
 return jsonb_build_object('attempt',n,'dead_lettered',p_outcome='failed' and n>=8);
end $$;
create or replace function public.replay_billing_webhook_event(p_event_uuid uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.billing_payment_events%rowtype; role_text text;
begin
 select * into v from public.billing_payment_events where id=p_event_uuid for update;
 if not found then raise exception 'Event not found.'; end if;
 select role into role_text from public.organization_members where organization_id=v.organization_id and user_id=p_actor_user_id and coalesce(status,'active')='active';
 if role_text not in('owner','admin') then raise exception 'Owner or admin permission required.'; end if;
 update public.billing_payment_events set status='received',next_retry_at=now(),dead_lettered_at=null,replayed_at=now(),replayed_by=p_actor_user_id where id=v.id;
 return jsonb_build_object('ok',true,'provider_event_id',v.provider_event_id,'payload',v.payload);
end $$;
revoke all on function public.mark_billing_webhook_attempt(text,text,text,integer) from public,anon,authenticated;
revoke all on function public.replay_billing_webhook_event(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_billing_webhook_attempt(text,text,text,integer) to service_role;
grant execute on function public.replay_billing_webhook_event(uuid,uuid) to service_role;
comment on table public.billing_webhook_attempts is 'Append-only delivery attempt history for resilient PayMongo webhook processing.';
commit;
