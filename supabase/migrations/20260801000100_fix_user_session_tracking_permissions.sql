-- Allow authenticated users to create and refresh only their own session rows.
-- RLS remains enabled and continues to isolate every user's sessions.

grant usage on schema public to authenticated;
grant select, insert, update on table public.user_sessions to authenticated;

drop policy if exists "users insert own sessions" on public.user_sessions;
create policy "users insert own sessions"
on public.user_sessions
for insert
to authenticated
with check (user_id = auth.uid());

-- Recreate the existing policies with an explicit authenticated role.
drop policy if exists "users read own sessions" on public.user_sessions;
create policy "users read own sessions"
on public.user_sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users update own sessions" on public.user_sessions;
create policy "users update own sessions"
on public.user_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
