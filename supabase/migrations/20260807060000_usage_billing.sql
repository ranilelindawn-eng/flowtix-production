begin;
create table if not exists public.usage_billing_rates (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.subscription_plans(id) on delete cascade,
 metric text not null check(metric in('ai_requests','emails','sms','calls','storage')),
 included_units bigint not null default 0 check(included_units>=0), unit_size bigint not null default 1 check(unit_size>0),
 unit_price integer not null default 0 check(unit_price>=0), currency text not null default 'PHP', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(plan_id,metric)
);
create table if not exists public.usage_billing_statements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 subscription_id uuid references public.organization_subscriptions(id) on delete set null,
 period_start date not null, period_end date not null, status text not null default 'open' check(status in('open','finalized','invoiced','void')),
 currency text not null default 'PHP', subtotal integer not null default 0, line_items jsonb not null default '[]'::jsonb,
 invoice_id uuid references public.billing_invoices(id) on delete set null, finalized_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,period_start,period_end)
);
alter table public.usage_billing_rates enable row level security;
alter table public.usage_billing_statements enable row level security;
revoke all on public.usage_billing_rates,public.usage_billing_statements from anon;
grant select on public.usage_billing_rates,public.usage_billing_statements to authenticated;
revoke insert,update,delete on public.usage_billing_rates,public.usage_billing_statements from authenticated;
create policy usage_billing_rates_read on public.usage_billing_rates for select to authenticated using(true);
create policy usage_billing_statements_members on public.usage_billing_statements for select to authenticated using(
 exists(select 1 from public.organization_members m where m.organization_id=usage_billing_statements.organization_id and m.user_id=auth.uid() and coalesce(m.status,'active')='active')
);
create or replace function public.calculate_usage_billing_statement(p_organization_id uuid,p_period_start date,p_period_end date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_sub public.organization_subscriptions%rowtype; v_lines jsonb:='[]'::jsonb; v_total integer:=0; r record; v_units bigint; v_billable bigint; v_amount integer; v_id uuid;
begin
 select * into v_sub from public.organization_subscriptions where organization_id=p_organization_id;
 if not found then raise exception 'Subscription not found.'; end if;
 for r in select * from public.usage_billing_rates where plan_id=v_sub.plan_id and active=true loop
   select coalesce(sum(e.units),0) into v_units from public.organization_usage_events e
    where e.organization_id=p_organization_id and e.metric=r.metric and e.period_start>=p_period_start and e.period_start<p_period_end;
   v_billable:=greatest(v_units-r.included_units,0);
   v_amount:=ceil(v_billable::numeric/r.unit_size)::integer*r.unit_price;
   v_total:=v_total+v_amount;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('metric',r.metric,'used_units',v_units,'included_units',r.included_units,'billable_units',v_billable,'unit_size',r.unit_size,'unit_price',r.unit_price,'amount',v_amount));
 end loop;
 insert into public.usage_billing_statements(organization_id,subscription_id,period_start,period_end,currency,subtotal,line_items)
 values(p_organization_id,v_sub.id,p_period_start,p_period_end,'PHP',v_total,v_lines)
 on conflict(organization_id,period_start,period_end) do update set subtotal=excluded.subtotal,line_items=excluded.line_items,updated_at=now()
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.calculate_usage_billing_statement(uuid,date,date) from public,anon,authenticated;
grant execute on function public.calculate_usage_billing_statement(uuid,date,date) to service_role;
comment on table public.usage_billing_statements is 'Provider-neutral overage calculations derived from the idempotent usage ledger.';
commit;
