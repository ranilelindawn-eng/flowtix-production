begin;

create or replace function public.configure_phone_number_inbound_route(
  target_organization uuid,
  target_phone_number uuid,
  target_ring_group uuid default null,
  target_queue uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  source_row public.organization_phone_numbers%rowtype;
  routing_phone_id uuid;
  route_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_org_admin(target_organization) then
    raise exception 'Organization admin permission required' using errcode = '42501';
  end if;
  if target_ring_group is not null and target_queue is not null then
    raise exception 'Choose either a ring group or a queue, not both';
  end if;

  select * into source_row
  from public.organization_phone_numbers
  where id = target_phone_number and organization_id = target_organization
  for update;
  if not found then raise exception 'Phone number not found'; end if;

  if target_ring_group is not null and not exists (
    select 1 from public.ring_groups
    where id = target_ring_group and organization_id = target_organization and is_active = true
  ) then raise exception 'Selected ring group is not active in this organization'; end if;

  if target_queue is not null and not exists (
    select 1 from public.call_queues
    where id = target_queue and organization_id = target_organization and is_active = true
  ) then raise exception 'Selected queue is not active in this organization'; end if;

  route_label := case
    when target_ring_group is not null then 'ring_group:' || target_ring_group::text
    when target_queue is not null then 'queue:' || target_queue::text
    else null
  end;

  update public.organization_phone_numbers
  set inbound_route = route_label, updated_at = now()
  where id = target_phone_number and organization_id = target_organization;

  insert into public.phone_numbers (
    organization_id, provider, provider_sid, phone_number, friendly_name,
    ring_group_id, queue_id, is_active, created_by, updated_at
  ) values (
    target_organization, source_row.provider, source_row.provider_number_id,
    source_row.phone_number, source_row.friendly_name, target_ring_group,
    target_queue, true, auth.uid(), now()
  )
  on conflict (phone_number) do update set
    provider = excluded.provider,
    provider_sid = excluded.provider_sid,
    friendly_name = excluded.friendly_name,
    ring_group_id = excluded.ring_group_id,
    queue_id = excluded.queue_id,
    is_active = true,
    updated_at = now()
  returning id into routing_phone_id;

  return routing_phone_id;
end;
$function$;

revoke all on function public.configure_phone_number_inbound_route(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.configure_phone_number_inbound_route(uuid,uuid,uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
