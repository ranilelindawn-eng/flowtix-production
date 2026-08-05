begin;
create table if not exists public.organization_secrets(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,secret_type text not null default 'generic',encrypted_value text not null,key_version integer not null default 1,last_four text,expires_at timestamptz,rotated_at timestamptz,revoked_at timestamptz,created_by uuid references auth.users(id) on delete set null,updated_by uuid references auth.users(id) on delete set null,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,name));
create table if not exists public.secret_access_events(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,secret_id uuid references public.organization_secrets(id) on delete set null,user_id uuid references auth.users(id) on delete set null,action text not null,outcome text not null default 'success',created_at timestamptz not null default now());
alter table public.organization_secrets enable row level security; alter table public.secret_access_events enable row level security;
create policy "admins read secret metadata" on public.organization_secrets for select using(exists(select 1 from public.organization_members m where m.organization_id=organization_secrets.organization_id and m.user_id=auth.uid() and m.role in('owner','admin')));
create policy "owners manage secrets" on public.organization_secrets for all using(exists(select 1 from public.organization_members m where m.organization_id=organization_secrets.organization_id and m.user_id=auth.uid() and m.role='owner')) with check(exists(select 1 from public.organization_members m where m.organization_id=organization_secrets.organization_id and m.user_id=auth.uid() and m.role='owner'));
create policy "admins read secret access" on public.secret_access_events for select using(exists(select 1 from public.organization_members m where m.organization_id=secret_access_events.organization_id and m.user_id=auth.uid() and m.role in('owner','admin')));
revoke select(encrypted_value) on public.organization_secrets from authenticated;
revoke all on public.organization_secrets from anon,authenticated;
revoke all on public.secret_access_events from anon,authenticated;

create or replace function public.list_organization_secret_metadata(p_organization_id uuid)
returns table(id uuid,name text,secret_type text,last_four text,expires_at timestamptz,rotated_at timestamptz,revoked_at timestamptz,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path=public,auth as $$
  select s.id,s.name,s.secret_type,s.last_four,s.expires_at,s.rotated_at,s.revoked_at,s.created_at,s.updated_at
  from public.organization_secrets s
  where s.organization_id=p_organization_id
    and exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role in('owner','admin'))
  order by s.updated_at desc;
$$;

create or replace function public.upsert_organization_secret(p_organization_id uuid,p_name text,p_secret_type text,p_encrypted_value text,p_last_four text,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$ declare sid uuid; begin
 if not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role='owner') then raise exception 'forbidden'; end if;
 insert into public.organization_secrets(organization_id,name,secret_type,encrypted_value,last_four,expires_at,rotated_at,created_by,updated_by)
 values(p_organization_id,trim(p_name),coalesce(nullif(trim(p_secret_type),''),'generic'),p_encrypted_value,p_last_four,p_expires_at,now(),auth.uid(),auth.uid())
 on conflict(organization_id,name) do update set secret_type=excluded.secret_type,encrypted_value=excluded.encrypted_value,last_four=excluded.last_four,expires_at=excluded.expires_at,rotated_at=now(),revoked_at=null,updated_by=auth.uid(),updated_at=now()
 returning id into sid;
 insert into public.secret_access_events(organization_id,secret_id,user_id,action) values(p_organization_id,sid,auth.uid(),'store_or_rotate'); return sid; end $$;

create or replace function public.revoke_organization_secret(p_organization_id uuid,p_secret_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$ begin
 if not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role='owner') then raise exception 'forbidden'; end if;
 update public.organization_secrets set revoked_at=coalesce(revoked_at,now()),updated_by=auth.uid(),updated_at=now() where id=p_secret_id and organization_id=p_organization_id;
 if found then insert into public.secret_access_events(organization_id,secret_id,user_id,action) values(p_organization_id,p_secret_id,auth.uid(),'revoke'); return true; end if; return false; end $$;

revoke all on function public.list_organization_secret_metadata(uuid) from public; grant execute on function public.list_organization_secret_metadata(uuid) to authenticated;
revoke all on function public.upsert_organization_secret(uuid,text,text,text,text,timestamptz) from public; grant execute on function public.upsert_organization_secret(uuid,text,text,text,text,timestamptz) to authenticated;
revoke all on function public.revoke_organization_secret(uuid,uuid) from public; grant execute on function public.revoke_organization_secret(uuid,uuid) to authenticated;
commit;
