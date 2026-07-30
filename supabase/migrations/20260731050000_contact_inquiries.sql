create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  topic text not null default 'General inquiry',
  message text not null check (char_length(message) between 10 and 5000),
  ip_address inet,
  user_agent text,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'stored', 'sent', 'failed')),
  delivery_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contact_inquiries_created_at_idx
  on public.contact_inquiries (created_at desc);

create index if not exists contact_inquiries_delivery_status_idx
  on public.contact_inquiries (delivery_status, created_at desc);

alter table public.contact_inquiries enable row level security;

revoke all on public.contact_inquiries from anon, authenticated;
grant all on public.contact_inquiries to service_role;

comment on table public.contact_inquiries is
  'Public website inquiries stored by the server-side contact endpoint. Direct client access is denied.';
