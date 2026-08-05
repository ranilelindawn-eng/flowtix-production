begin;

alter table public.tags
  add column if not exists slug text,
  add column if not exists description text,
  add column if not exists category text not null default 'general',
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.tags
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
where slug is null or btrim(slug) = '';

alter table public.tags alter column slug set not null;

alter table public.tags drop constraint if exists tags_category_check;
alter table public.tags add constraint tags_category_check
  check (category in ('general','lifecycle','source','priority','campaign','product','region','custom'));

alter table public.tags drop constraint if exists tags_color_check;
alter table public.tags add constraint tags_color_check check (color ~ '^#[0-9A-Fa-f]{6}$');

create unique index if not exists tags_organization_slug_unique
  on public.tags (organization_id, lower(slug));
create index if not exists tags_active_category_idx
  on public.tags (organization_id, is_active, category, name);

alter table public.entity_tags drop constraint if exists entity_tags_entity_type_check;
alter table public.entity_tags add constraint entity_tags_entity_type_check
  check (entity_type in ('contact','company','opportunity','campaign','task','activity','calendar','call'));

alter table public.entity_tags
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.entity_tags drop constraint if exists entity_tags_source_check;
alter table public.entity_tags add constraint entity_tags_source_check
  check (source in ('manual','import','automation','ai','system'));

create index if not exists entity_tags_entity_lookup_idx
  on public.entity_tags (organization_id, entity_type, entity_id);
create index if not exists entity_tags_tag_lookup_idx
  on public.entity_tags (organization_id, tag_id, created_at desc);

create table if not exists public.tag_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('assigned','removed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tag_assignment_history_entity_idx
  on public.tag_assignment_history (organization_id, entity_type, entity_id, created_at desc);
create index if not exists tag_assignment_history_tag_idx
  on public.tag_assignment_history (organization_id, tag_id, created_at desc);

create or replace function public.normalize_tag_slug(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.prepare_tag_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  if new.name = '' then raise exception 'TAG_NAME_REQUIRED'; end if;
  new.slug := public.normalize_tag_slug(coalesce(nullif(btrim(new.slug), ''), new.name));
  if new.slug = '' then raise exception 'TAG_SLUG_REQUIRED'; end if;
  new.updated_at := now();
  if new.is_active then
    new.archived_at := null;
    new.archived_by := null;
  elsif old.is_active is distinct from new.is_active and not new.is_active then
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_by := coalesce(new.archived_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_tag_record_trigger on public.tags;
create trigger prepare_tag_record_trigger
before insert or update on public.tags
for each row execute function public.prepare_tag_record();

create or replace function public.validate_tag_entity_relationship()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  tag_org uuid;
  entity_org uuid;
  exists_entity boolean := false;
begin
  select organization_id into tag_org from public.tags where id = new.tag_id and is_active = true;
  if tag_org is null or tag_org <> new.organization_id then raise exception 'INVALID_TAG_ORGANIZATION'; end if;

  case new.entity_type
    when 'contact' then select organization_id into entity_org from public.contacts where id = new.entity_id;
    when 'company' then select organization_id into entity_org from public.companies where id = new.entity_id;
    when 'opportunity' then select organization_id into entity_org from public.opportunities where id = new.entity_id;
    when 'campaign' then select organization_id into entity_org from public.campaigns where id = new.entity_id;
    when 'task' then select organization_id into entity_org from public.contact_tasks where id = new.entity_id;
    when 'activity' then select organization_id into entity_org from public.crm_activities where id = new.entity_id;
    when 'calendar' then select organization_id into entity_org from public.calendar_events where id = new.entity_id;
    when 'call' then select organization_id into entity_org from public.calls where id = new.entity_id;
    else raise exception 'UNSUPPORTED_TAG_ENTITY';
  end case;

  if entity_org is null or entity_org <> new.organization_id then raise exception 'INVALID_TAG_ENTITY_ORGANIZATION'; end if;
  new.assigned_by := coalesce(new.assigned_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists validate_tag_entity_relationship_trigger on public.entity_tags;
create trigger validate_tag_entity_relationship_trigger
before insert or update on public.entity_tags
for each row execute function public.validate_tag_entity_relationship();

create or replace function public.capture_tag_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tag_assignment_history (organization_id, tag_id, entity_type, entity_id, action, actor_user_id, source, metadata)
    values (new.organization_id, new.tag_id, new.entity_type, new.entity_id, 'assigned', coalesce(new.assigned_by, auth.uid()), new.source, new.metadata);
    return new;
  end if;
  insert into public.tag_assignment_history (organization_id, tag_id, entity_type, entity_id, action, actor_user_id, source, metadata)
  values (old.organization_id, old.tag_id, old.entity_type, old.entity_id, 'removed', auth.uid(), old.source, old.metadata);
  return old;
end;
$$;

drop trigger if exists capture_tag_assignment_history_trigger on public.entity_tags;
create trigger capture_tag_assignment_history_trigger
after insert or delete on public.entity_tags
for each row execute function public.capture_tag_assignment_history();

create or replace function public.tag_usage_counts(target_organization_id uuid)
returns table(tag_id uuid, usage_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select et.tag_id, count(*)::bigint
  from public.entity_tags et
  where et.organization_id = target_organization_id
    and public.is_organization_member(target_organization_id)
  group by et.tag_id;
$$;

grant execute on function public.tag_usage_counts(uuid) to authenticated;

alter table public.tag_assignment_history enable row level security;

drop policy if exists tag_assignment_history_select on public.tag_assignment_history;
create policy tag_assignment_history_select on public.tag_assignment_history
for select to authenticated
using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.tag_assignment_history from authenticated, anon;
revoke all on public.tags from anon;
revoke all on public.entity_tags from anon;

commit;
