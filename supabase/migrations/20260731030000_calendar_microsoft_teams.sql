begin;

alter table public.calendar_events
  drop constraint if exists calendar_events_meeting_provider_check;

alter table public.calendar_events
  add constraint calendar_events_meeting_provider_check
  check (meeting_provider in ('none','zoom','teams','custom'));

notify pgrst, 'reload schema';

commit;
