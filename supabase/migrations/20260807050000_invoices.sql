begin;
create sequence if not exists public.billing_invoice_number_seq;
create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  payment_id uuid references public.billing_payments(id) on delete set null,
  invoice_number text not null unique default ('FTX-'||to_char(now(),'YYYYMM')||'-'||lpad(nextval('public.billing_invoice_number_seq')::text,8,'0')),
  status text not null default 'draft' check(status in('draft','open','paid','void','uncollectible','refunded')),
  currency text not null default 'PHP' check(currency~'^[A-Z]{3}$'),
  subtotal integer not null default 0 check(subtotal>=0), tax integer not null default 0 check(tax>=0),
  total integer not null default 0 check(total>=0), amount_paid integer not null default 0 check(amount_paid>=0),
  amount_due integer not null default 0 check(amount_due>=0),
  period_start timestamptz, period_end timestamptz, due_at timestamptz,
  paid_at timestamptz, voided_at timestamptz,
  line_items jsonb not null default '[]'::jsonb,
  billing_details jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists billing_invoices_payment_unique on public.billing_invoices(payment_id) where payment_id is not null;
create index if not exists billing_invoices_org_created_idx on public.billing_invoices(organization_id,created_at desc);
alter table public.billing_invoices enable row level security;
revoke all on public.billing_invoices from anon;
revoke insert,update,delete on public.billing_invoices from authenticated;
grant select on public.billing_invoices to authenticated;
create policy billing_invoices_select_members on public.billing_invoices for select to authenticated using (
 exists(select 1 from public.organization_members m where m.organization_id=billing_invoices.organization_id and m.user_id=auth.uid() and coalesce(m.status,'active')='active')
);
create or replace function public.generate_invoice_for_payment(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.billing_payments%rowtype; s public.organization_subscriptions%rowtype; v_id uuid;
begin
 select * into p from public.billing_payments where id=p_payment_id for update;
 if not found then raise exception 'Payment not found.'; end if;
 select * into s from public.organization_subscriptions where id=p.subscription_id;
 insert into public.billing_invoices(organization_id,subscription_id,payment_id,status,currency,subtotal,total,amount_paid,amount_due,period_start,period_end,paid_at,line_items,metadata)
 values(p.organization_id,p.subscription_id,p.id,case when p.status='paid' then 'paid' else 'open' end,p.currency,coalesce(p.amount,0),coalesce(p.amount,0),case when p.status='paid' then coalesce(p.amount,0) else 0 end,case when p.status='paid' then 0 else coalesce(p.amount,0) end,s.current_period_start,s.current_period_end,p.paid_at,
   jsonb_build_array(jsonb_build_object('description',coalesce(p.plan_code,'Flowtix subscription'),'quantity',1,'unit_amount',coalesce(p.amount,0),'amount',coalesce(p.amount,0))),
   jsonb_build_object('provider',p.provider,'provider_payment_id',p.provider_payment_id))
 on conflict(payment_id) do update set status=excluded.status,amount_paid=excluded.amount_paid,amount_due=excluded.amount_due,paid_at=excluded.paid_at,updated_at=now()
 returning id into v_id;
 return v_id;
end $$;
create or replace function public.create_invoice_after_payment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='paid' and (old.status is distinct from new.status or old.id is null) then
    perform public.generate_invoice_for_payment(new.id);
  end if;
  return new;
end $$;
drop trigger if exists billing_payments_create_invoice on public.billing_payments;
create trigger billing_payments_create_invoice after insert or update of status on public.billing_payments
for each row execute function public.create_invoice_after_payment();
revoke all on function public.generate_invoice_for_payment(uuid) from public,anon,authenticated;
grant execute on function public.generate_invoice_for_payment(uuid) to service_role;
comment on table public.billing_invoices is 'Immutable customer-facing invoice ledger generated from billing payments.';
commit;
