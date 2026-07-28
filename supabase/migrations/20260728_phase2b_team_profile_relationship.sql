-- Add the PostgREST relationship needed by the Team page.

alter table public.organization_members
drop constraint if exists organization_members_user_id_profiles_fkey;

alter table public.organization_members
add constraint organization_members_user_id_profiles_fkey
foreign key (user_id)
references public.profiles(id)
on delete cascade;

notify pgrst, 'reload schema';