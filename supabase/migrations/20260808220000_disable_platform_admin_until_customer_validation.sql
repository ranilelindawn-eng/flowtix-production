begin;

-- Platform administration is intentionally disabled until the customer
-- application completes production validation and a dedicated platform-role
-- model is introduced. Organization owner/admin roles are customer roles and
-- must never authorize platform-wide administration.
revoke all on function public.get_platform_admin_overview() from public;
revoke all on function public.get_platform_admin_overview() from anon;
revoke all on function public.get_platform_admin_overview() from authenticated;

revoke all on function public.execute_platform_admin_command(text, jsonb) from public;
revoke all on function public.execute_platform_admin_command(text, jsonb) from anon;
revoke all on function public.execute_platform_admin_command(text, jsonb) from authenticated;

commit;
