begin;

-- Ensure the subscription lifecycle event conflict clause has a matching unique index.
create unique index if not exists subscription_lifecycle_events_provider_event_unique
  on public.subscription_lifecycle_events (provider_event_id, event_type)
  where provider_event_id is not null;

commit;
