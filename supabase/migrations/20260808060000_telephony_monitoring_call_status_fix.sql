begin;

-- The current public.call_status enum contains:
-- completed, failed, scheduled, cancelled.
--
-- The original monitoring collector compared the enum directly against
-- queued, ringing, and connected, which PostgreSQL rejects before evaluating
-- the query. Casting to text keeps the collector compatible with the current
-- enum and with future lifecycle values.

create or replace function public.collect_telephony_monitoring_snapshot(target_organization uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_id uuid;
  captured timestamptz := now();
  active_count integer;
  ringing_count integer;
  connected_count integer;
  queued_count integer;
  waiting_count integer;
  oldest_wait integer;
  available_count integer;
  busy_count integer;
  offline_count integer;
  routing_failures integer;
  provider_errors integer;
  calls_hour integer;
  answered_hour integer;
  failed_hour integer;
  avg_answer numeric;
  rate numeric;
  provider_json jsonb;
  routing_json jsonb;
  queue_json jsonb;
  rule_record record;
  observed_value numeric;
  triggered boolean;
  current_alert uuid;
begin
  if target_organization is null then
    raise exception 'organization_required';
  end if;

  select
    count(*) filter (where status::text in ('queued','ringing','connected','scheduled')),
    count(*) filter (where status::text = 'ringing'),
    count(*) filter (where status::text = 'connected'),
    count(*) filter (where status::text in ('queued','scheduled'))
  into active_count, ringing_count, connected_count, queued_count
  from public.calls where organization_id = target_organization;

  select count(*), coalesce(max(extract(epoch from (captured - entered_at)))::integer, 0)
  into waiting_count, oldest_wait
  from public.call_queue_entries
  where organization_id = target_organization and status = 'waiting';

  select
    count(*) filter (where availability = 'available' and activity_state = 'idle'),
    count(*) filter (where activity_state in ('ringing','busy','wrap_up')),
    count(*) filter (where availability = 'offline' or last_seen_at < captured - interval '90 seconds')
  into available_count, busy_count, offline_count
  from public.agent_presence where organization_id = target_organization;

  select count(*) into routing_failures
  from public.call_routing_attempts
  where organization_id = target_organization
    and created_at >= captured - interval '1 hour'
    and status in ('failed','no_agents');

  select count(*) into provider_errors
  from public.telephony_provider_events
  where organization_id = target_organization
    and occurred_at >= captured - interval '1 hour'
    and (normalized_status = 'failed' or event_type ilike '%fail%' or event_type ilike '%error%');

  select
    count(*),
    count(*) filter (where status::text in ('connected','completed')),
    count(*) filter (where status::text in ('failed','cancelled'))
  into calls_hour, answered_hour, failed_hour
  from public.calls
  where organization_id = target_organization and started_at >= captured - interval '1 hour';

  select avg(extract(epoch from (answered_at - started_at)))
  into avg_answer
  from public.call_routing_attempts
  where organization_id = target_organization
    and started_at >= captured - interval '1 hour'
    and answered_at is not null;

  rate := case when calls_hour > 0 then answered_hour::numeric / calls_hour::numeric else 0 end;

  select coalesce(jsonb_object_agg(provider, total), '{}'::jsonb) into provider_json
  from (select coalesce(provider, 'unknown') provider, count(*) total from public.calls
    where organization_id = target_organization and started_at >= captured - interval '1 hour' group by provider) p;

  select coalesce(jsonb_object_agg(coalesce(strategy, 'unknown'), total), '{}'::jsonb) into routing_json
  from (select strategy, count(*) total from public.call_routing_attempts
    where organization_id = target_organization and created_at >= captured - interval '1 hour' group by strategy) r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'queueId', q.id, 'name', q.name, 'waiting', coalesce(e.waiting, 0),
    'reserved', coalesce(e.reserved, 0), 'oldestWaitSeconds', coalesce(e.oldest_wait, 0),
    'maxSize', q.max_size, 'active', q.is_active
  ) order by q.name), '[]'::jsonb) into queue_json
  from public.call_queues q
  left join lateral (
    select count(*) filter (where status = 'waiting') waiting,
      count(*) filter (where status in ('reserved','connecting')) reserved,
      coalesce(max(extract(epoch from (captured - entered_at))) filter (where status = 'waiting')::integer, 0) oldest_wait
    from public.call_queue_entries ce where ce.queue_id = q.id
  ) e on true
  where q.organization_id = target_organization;

  insert into public.telephony_monitoring_snapshots (
    organization_id, captured_at, active_calls, ringing_calls, connected_calls, queued_calls,
    waiting_queue_entries, oldest_queue_wait_seconds, available_agents, busy_agents, offline_agents,
    routing_failures_last_hour, provider_errors_last_hour, calls_last_hour, answered_calls_last_hour,
    failed_calls_last_hour, average_answer_seconds, answer_rate, provider_breakdown, routing_breakdown,
    queue_breakdown, diagnostics
  ) values (
    target_organization, captured, active_count, ringing_count, connected_count, queued_count,
    waiting_count, oldest_wait, available_count, busy_count, offline_count,
    routing_failures, provider_errors, calls_hour, answered_hour, failed_hour, avg_answer, rate,
    provider_json, routing_json, queue_json,
    jsonb_build_object('collectorVersion', 1, 'capturedAt', captured)
  ) returning id into snapshot_id;

  insert into public.telephony_alert_rules (organization_id, rule_key, name, severity, metric, operator, threshold, evaluation_window_minutes, cooldown_minutes)
  values
    (target_organization, 'queue_wait_high', 'Queue wait is high', 'warning', 'oldest_queue_wait_seconds', 'gte', 120, 5, 15),
    (target_organization, 'provider_errors_high', 'Provider errors detected', 'critical', 'provider_errors_last_hour', 'gte', 5, 60, 15),
    (target_organization, 'routing_failures_high', 'Routing failures detected', 'warning', 'routing_failures_last_hour', 'gte', 5, 60, 15),
    (target_organization, 'no_available_agents', 'No agents available', 'warning', 'available_agents', 'lte', 0, 5, 15)
  on conflict (organization_id, rule_key) do nothing;

  for rule_record in select * from public.telephony_alert_rules where organization_id = target_organization and enabled loop
    observed_value := case rule_record.metric
      when 'oldest_queue_wait_seconds' then oldest_wait
      when 'provider_errors_last_hour' then provider_errors
      when 'routing_failures_last_hour' then routing_failures
      when 'available_agents' then available_count
      when 'failed_calls_last_hour' then failed_hour
      when 'answer_rate' then rate
      else null end;
    if observed_value is null then continue; end if;
    triggered := case rule_record.operator
      when 'gt' then observed_value > rule_record.threshold
      when 'gte' then observed_value >= rule_record.threshold
      when 'lt' then observed_value < rule_record.threshold
      when 'lte' then observed_value <= rule_record.threshold
      when 'eq' then observed_value = rule_record.threshold
      else false end;

    select id into current_alert from public.telephony_alerts
    where organization_id = target_organization and rule_key = rule_record.rule_key and status = 'open'
      and last_observed_at >= captured - make_interval(mins => rule_record.cooldown_minutes)
    order by last_observed_at desc limit 1;

    if triggered then
      if current_alert is not null then
        update public.telephony_alerts set metric_value = observed_value,
          last_observed_at = captured, occurrence_count = occurrence_count + 1,
          source_snapshot_id = snapshot_id where id = current_alert;
      else
        insert into public.telephony_alerts (organization_id, rule_id, rule_key, severity, title, message,
          metric, metric_value, threshold, source_snapshot_id, metadata)
        values (target_organization, rule_record.id, rule_record.rule_key, rule_record.severity,
          rule_record.name, rule_record.name || ': ' || observed_value::text || ' (threshold ' || rule_record.threshold::text || ')',
          rule_record.metric, observed_value, rule_record.threshold, snapshot_id,
          jsonb_build_object('operator', rule_record.operator));
      end if;
    elsif current_alert is not null then
      update public.telephony_alerts set status = 'resolved', resolved_at = captured, last_observed_at = captured
      where id = current_alert;
    end if;
    current_alert := null;
  end loop;

  delete from public.telephony_monitoring_snapshots
  where organization_id = target_organization and captured_at < captured - interval '30 days';

  return snapshot_id;
end;
$$;

grant execute
on function public.collect_telephony_monitoring_snapshot(uuid)
to authenticated, service_role;

commit;
