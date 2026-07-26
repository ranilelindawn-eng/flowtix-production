# Supabase SQL Setup for CallFlow

## Execution order
1. `schema.sql`
2. `policies.sql`
3. `storage.sql`
4. `seed.sql`

Run this order in the Supabase SQL editor or via migration tooling. Each file is organized so dependencies exist before use.

## How to run
1. Open Supabase project.
2. Go to SQL editor.
3. Run `schema.sql` first.
4. Run `policies.sql` second.
5. Run `storage.sql` third.
6. Run `seed.sql` last if you want demo data.

## Which files are production-safe
- `schema.sql` is production-safe and creates schema objects, constraints, RLS trigger bootstrap, and reporting objects.
- `policies.sql` is production-safe and enables tenant isolation.
- `storage.sql` declares private buckets and documents storage policy expectations.
- `seed.sql` is development-only and should not be run in production without review.

## Why `seed.sql` is development-only
- It inserts deterministic demo records.
- It requires at least one real CallFlow user to exist.
- It automatically uses the first existing profile and organization.
- It should not be executed against a production database because it can populate a real tenant with demo data.

## Organization creation after signup
- `schema.sql` defines `handle_new_user_signup()` and an `auth.users` insert trigger.
- When a new user signs up, the trigger creates:
  - a starter `public.organizations` row
  - a `public.profiles` row linked to `auth.users.id`
  - a `public.organization_members` row with `role = 'owner'`
- The trigger uses `new.email` and `new.raw_user_meta_data->>'full_name'` for display name only.
- The trigger avoids duplicates using `ON CONFLICT DO NOTHING`.

## How RLS isolates tenants
- Every table has row-level security enabled.
- `public.is_org_member(org_id)` checks active membership and `auth.uid()`.
- Policies permit only authenticated users.
- Tenant rows are protected by `organization_id` membership checks.
- `profiles` are readable only if the current user belongs to the same organization.
- `organization_members` write operations require org admin/owner rights.

## Storage path convention
- Use `organization_id/user_id/file.ext` for object paths.
- Example paths:
  - `recordings/{organization_id}/{user_id}/call-123.mp3`
  - `avatars/{organization_id}/{user_id}/avatar.png`
  - `exports/{organization_id}/{user_id}/report.csv`
- Buckets are private and access is controlled by storage object policies.

## Verifying policies with two test users
1. Create two distinct organizations and users.
2. Ensure each user is only a member of one organization.
3. Try selecting rows from the other organization using the browser client.
4. Confirm access is denied.
5. Confirm users can only insert/update/delete rows for their own organization.

## Rollback cautions
- `schema.sql` creates production tables and functions.
- Dropping objects may lose tenant data.
- Review all changes before rollbacks.
- Do not use `seed.sql` as a rollback mechanism.

## Frontend credential warning
- Never put Supabase `service_role` keys into frontend code.
- Browser clients must use `anon` keys with RLS enforced.
- `service_role` keys are only for server-side migration, admin, or backend tasks.
