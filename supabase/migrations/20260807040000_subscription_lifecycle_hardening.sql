begin;

alter table public.organization_subscriptions
  add column if not exists scheduled_plan_id uuid references public.subscription_plans(id) on delete set null,
  add column if not exists scheduled_plan_effective_at timestamptz,
  add column if not exists renewal_attempt_count integer not null default 0,
  add column if not exists next_renewal_attempt_at timestamptz,
  add column if not exists lifecycle_version bigint not null default 1;

create index if not exists organization_subscriptions_renewal_due_idx
  on public.organization_subscriptions (current_period_end, next_renewal_attempt_at)
  where status in ('active','past_due','suspended');

create or replace function public.schedule_subscription_plan_change(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_plan_code text,
  p_effective text default 'period_end'
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_role text;
  v_when timestamptz;
begin
  select role into v_role from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id
    and coalesce(status,'active')='active' limit 1;
  if v_role is distinct from 'owner' then raise exception 'Only the workspace owner can change plans.'; end if;
  select * into v_plan from public.subscription_plans where code=p_plan_code and is_active=true limit 1;
  if not found then raise exception 'Plan not found.'; end if;
  select * into v_sub from public.organization_subscriptions where organization_id=p_organization_id for update;
  if not found then raise exception 'Subscription not found.'; end if;
  if v_sub.plan_id=v_plan.id then raise exception 'The subscription already uses this plan.'; end if;
  if p_effective='immediate' then
    update public.organization_subscriptions
      set plan_id=v_plan.id, scheduled_plan_id=null, scheduled_plan_effective_at=null,
          paymongo_plan_code=v_plan.code, lifecycle_version=lifecycle_version+1, updated_at=now()
      where id=v_sub.id;
    v_when:=now();
  else
    v_when:=coalesce(v_sub.current_period_end, now());
    update public.organization_subscriptions
      set scheduled_plan_id=v_plan.id, scheduled_plan_effective_at=v_when,
          lifecycle_version=lifecycle_version+1, updated_at=now()
      where id=v_sub.id;
  end if;
  insert into public.subscription_lifecycle_events
    (organization_id,subscription_id,event_type,source,previous_status,new_status,plan_id,actor_user_id,metadata)
  values (p_organization_id,v_sub.id,'plan_change_scheduled','user',v_sub.status,v_sub.status,v_plan.id,p_actor_user_id,
    jsonb_build_object('effective',p_effective,'effective_at',v_when,'previous_plan_id',v_sub.plan_id));
  return jsonb_build_object('ok',true,'effective_at',v_when,'plan_code',v_plan.code);
end $$;

create or replace function public.process_subscription_renewals()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; r record;
begin
  for r in select * from public.organization_subscriptions
    where status='active' and current_period_end is not null and current_period_end<=now()
    for update skip locked
  loop
    update public.organization_subscriptions set
      status='past_due',
      grace_period_ends_at=coalesce(grace_period_ends_at,now()+interval '7 days'),
      renewal_attempt_count=renewal_attempt_count+1,
      next_renewal_attempt_at=now()+interval '24 hours',
      lifecycle_version=lifecycle_version+1,
      updated_at=now()
    where id=r.id;
    insert into public.subscription_lifecycle_events
      (organization_id,subscription_id,event_type,source,previous_status,new_status,plan_id,metadata)
    values (r.organization_id,r.id,'renewal_payment_required','system',r.status,'past_due',r.plan_id,
      jsonb_build_object('period_end',r.current_period_end,'grace_period_days',7));
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

revoke all on function public.schedule_subscription_plan_change(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.process_subscription_renewals() from public,anon,authenticated;
grant execute on function public.schedule_subscription_plan_change(uuid,uuid,text,text) to service_role;
grant execute on function public.process_subscription_renewals() to service_role;

comment on function public.process_subscription_renewals() is 'Advances paid subscription periods and atomically applies scheduled plan changes.';

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    begin
      perform cron.unschedule('flowtix-subscription-renewals');
    exception when others then null; end;
    perform cron.schedule('flowtix-subscription-renewals','*/15 * * * *','select public.process_subscription_renewals();');
  end if;
end $$;
commit;
