begin;

-- Consolidated dashboard analytics access repair.
-- Existing Row Level Security remains enabled and continues to enforce
-- organization isolation.

do $$
declare
  table_name text;
  read_tables text[] := array[
    'organization_members',
    'profiles',
    'calls',
    'call_routing_attempts',
    'call_queue_entries',
    'call_queues',
    'campaigns',
    'campaign_members',
    'campaign_engagement_events',
    'communication_messages',
    'sequences',
    'sequence_enrollments',
    'sequence_step_executions',
    'contact_tasks',
    'crm_activities',
    'opportunities',
    'pipelines',
    'pipeline_stages',
    'summaries',
    'agent_presence',
    'attendance_entries',
    'ai_conversations',
    'ai_messages',
    'ai_coaching_analyses',
    'ai_sentiment_analyses',
    'ai_transcript_processing_runs',
    'ai_usage_reservations',
    'sales_analytics_snapshots',
    'call_analytics_snapshots',
    'agent_analytics_snapshots',
    'campaign_analytics_snapshots',
    'ai_analytics_snapshots'
  ];
begin
  foreach table_name in array read_tables
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'grant select on table public.%I to authenticated',
        table_name
      );
      execute format(
        'grant all on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$$;

-- Analytics services create snapshot rows after collecting data.
do $$
declare
  table_name text;
  snapshot_tables text[] := array[
    'sales_analytics_snapshots',
    'call_analytics_snapshots',
    'agent_analytics_snapshots',
    'campaign_analytics_snapshots',
    'ai_analytics_snapshots'
  ];
begin
  foreach table_name in array snapshot_tables
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'grant insert on table public.%I to authenticated',
        table_name
      );
    end if;
  end loop;
end
$$;

-- Keep sensitive encrypted-secret and internal coordination stores private.
do $$
declare
  table_name text;
  sensitive_tables text[] := array[
    'organization_integration_secrets',
    'organization_secrets',
    'secret_access_events',
    'automation_throttle_events',
    'idempotency_records'
  ];
begin
  foreach table_name in array sensitive_tables
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'revoke all on table public.%I from anon, authenticated',
        table_name
      );
      execute format(
        'grant all on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$$;

commit;
