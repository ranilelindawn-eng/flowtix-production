# Flowtix Phase 8 — Security Setup

## Included
- Database-backed rate limiting for sign-in and password reset
- Organization-scoped audit logs
- Session and device-history tracking
- Supabase Auth TOTP two-factor authentication
- Existing password reset flow corrected to use NEXT_PUBLIC_SITE_URL
- Email verification supported through Supabase Auth
- Security Center dashboard

## Install
1. Copy this package over your existing Phase 7 project.
2. Run `supabase/migrations/20260724_phase8_security.sql` in Supabase SQL Editor.
3. In Supabase Dashboard → Authentication → Providers → Email, enable **Confirm email**.
4. In Authentication → URL Configuration, add:
   - `http://localhost:3000/**`
   - your production domain
5. In Authentication → Multi-Factor Authentication, enable TOTP.
6. Ensure `.env.local` contains `NEXT_PUBLIC_SITE_URL=http://localhost:3000` locally.
7. Run `npm install`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

## Production notes
Use a trusted reverse proxy so `x-forwarded-for` contains the real client IP. Rate-limit records should be periodically cleaned with a scheduled database job. Supabase manages password hashing, verified-email state, refresh tokens, and TOTP secrets.
