-- Flowtix Platform Admin — AI analytics diagnostics
--
-- Moves platform-wide feature/model/prompt/provider performance breakdowns out of
-- customer workspaces and into the existing internal Platform AI area.
-- No provider credentials are exposed.

begin;

create or replace function public.platform_ai_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  result jsonb;
  feature_metrics jsonb;
  model_metrics jsonb;
  prompt_metrics jsonb;
  provider_metrics jsonb;
begin
  if not public.platform_can_manage_ai() then
    raise exception 'PLATFORM_AI_ACCESS_DENIED' using errcode = '42501';
  end if;

  with grouped as (
    select
      coalesce(nullif(usage.feature, ''), 'unknown') as metric_key,
      count(*)::bigint as requests,
      count(*) filter (where usage.status = 'completed')::bigint as completed,
      count(*) filter (where usage.status = 'failed')::bigint as failed,
      coalesce(sum(usage.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(usage.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(usage.cost_micros), 0)::bigint as cost_micros,
      coalesce(round(avg(usage.latency_ms) filter (where usage.latency_ms is not null)), 0)::bigint as average_latency_ms
    from public.ai_usage_reservations usage
    where usage.created_at >= pg_catalog.now() - interval '30 days'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', metric_key,
        'label', replace(metric_key, '_', ' '),
        'requests', requests,
        'completed', completed,
        'failed', failed,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens,
        'costMicros', cost_micros,
        'averageLatencyMs', average_latency_ms,
        'successRate',
          case when completed + failed > 0
            then round((completed::numeric / (completed + failed)::numeric) * 100, 4)
            else 0
          end
      )
      order by requests desc, metric_key
    ),
    '[]'::jsonb
  )
  into feature_metrics
  from grouped;

  with grouped as (
    select
      coalesce(nullif(usage.model, ''), 'unknown') as metric_key,
      count(*)::bigint as requests,
      count(*) filter (where usage.status = 'completed')::bigint as completed,
      count(*) filter (where usage.status = 'failed')::bigint as failed,
      coalesce(sum(usage.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(usage.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(usage.cost_micros), 0)::bigint as cost_micros,
      coalesce(round(avg(usage.latency_ms) filter (where usage.latency_ms is not null)), 0)::bigint as average_latency_ms
    from public.ai_usage_reservations usage
    where usage.created_at >= pg_catalog.now() - interval '30 days'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', metric_key,
        'label', replace(metric_key, '_', ' '),
        'requests', requests,
        'completed', completed,
        'failed', failed,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens,
        'costMicros', cost_micros,
        'averageLatencyMs', average_latency_ms,
        'successRate',
          case when completed + failed > 0
            then round((completed::numeric / (completed + failed)::numeric) * 100, 4)
            else 0
          end
      )
      order by requests desc, metric_key
    ),
    '[]'::jsonb
  )
  into model_metrics
  from grouped;

  with grouped as (
    select
      coalesce(
        nullif(usage.metadata ->> 'prompt_key', ''),
        nullif(usage.metadata ->> 'promptKey', ''),
        'unspecified'
      ) as metric_key,
      count(*)::bigint as requests,
      count(*) filter (where usage.status = 'completed')::bigint as completed,
      count(*) filter (where usage.status = 'failed')::bigint as failed,
      coalesce(sum(usage.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(usage.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(usage.cost_micros), 0)::bigint as cost_micros,
      coalesce(round(avg(usage.latency_ms) filter (where usage.latency_ms is not null)), 0)::bigint as average_latency_ms
    from public.ai_usage_reservations usage
    where usage.created_at >= pg_catalog.now() - interval '30 days'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', metric_key,
        'label', replace(metric_key, '_', ' '),
        'requests', requests,
        'completed', completed,
        'failed', failed,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens,
        'costMicros', cost_micros,
        'averageLatencyMs', average_latency_ms,
        'successRate',
          case when completed + failed > 0
            then round((completed::numeric / (completed + failed)::numeric) * 100, 4)
            else 0
          end
      )
      order by requests desc, metric_key
    ),
    '[]'::jsonb
  )
  into prompt_metrics
  from grouped;

  with grouped as (
    select
      coalesce(nullif(usage.provider, ''), 'unknown') as metric_key,
      count(*)::bigint as requests,
      count(*) filter (where usage.status = 'completed')::bigint as completed,
      count(*) filter (where usage.status = 'failed')::bigint as failed,
      coalesce(sum(usage.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(usage.output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(usage.cost_micros), 0)::bigint as cost_micros,
      coalesce(round(avg(usage.latency_ms) filter (where usage.latency_ms is not null)), 0)::bigint as average_latency_ms
    from public.ai_usage_reservations usage
    where usage.created_at >= pg_catalog.now() - interval '30 days'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', metric_key,
        'label', replace(metric_key, '_', ' '),
        'requests', requests,
        'completed', completed,
        'failed', failed,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens,
        'costMicros', cost_micros,
        'averageLatencyMs', average_latency_ms,
        'successRate',
          case when completed + failed > 0
            then round((completed::numeric / (completed + failed)::numeric) * 100, 4)
            else 0
          end
      )
      order by requests desc, metric_key
    ),
    '[]'::jsonb
  )
  into provider_metrics
  from grouped;

  select jsonb_build_object(
    'requestsThisMonth',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())),
    'completedThisMonth',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'failedThisMonth',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'failed'),
    'inputTokensThisMonth',
      (select coalesce(sum(usage.input_tokens), 0) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'outputTokensThisMonth',
      (select coalesce(sum(usage.output_tokens), 0) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'costMicrosThisMonth',
      (select coalesce(sum(usage.cost_micros), 0) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())
         and usage.status = 'completed'),
    'organizationsUsingAIThisMonth',
      (select count(distinct usage.organization_id) from public.ai_usage_reservations usage
       where usage.created_at >= date_trunc('month', pg_catalog.now())),
    'requestsLast24Hours',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= pg_catalog.now() - interval '24 hours'),
    'failuresLast24Hours',
      (select count(*) from public.ai_usage_reservations usage
       where usage.created_at >= pg_catalog.now() - interval '24 hours'
         and usage.status = 'failed'),
    'averageLatencyMsLast24Hours',
      (select coalesce(round(avg(usage.latency_ms)), 0) from public.ai_usage_reservations usage
       where usage.created_at >= pg_catalog.now() - interval '24 hours'
         and usage.status = 'completed'
         and usage.latency_ms is not null),
    'featureMetrics', feature_metrics,
    'modelMetrics', model_metrics,
    'promptMetrics', prompt_metrics,
    'providerMetrics', provider_metrics
  ) into result;

  return result;
end;
$function$;

revoke all on function public.platform_ai_metrics() from public, anon;
grant execute on function public.platform_ai_metrics() to authenticated;

notify pgrst, 'reload schema';

commit;
