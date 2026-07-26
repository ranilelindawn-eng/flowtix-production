# Phase 9 — Settings Center Setup

## Included
- Profile settings and avatar
- Organization profile and logo
- Team settings entry point
- API key creation, hashing, scopes, last-used tracking, and revocation
- Billing settings entry point with Stripe subscription management
- Integration registry for telephony, AI, productivity, and automation providers
- Organization phone-number registry and default outbound number
- Tenant-aware RLS for all new tables

## Install
1. Copy this package over the Phase 8 project and replace matching files.
2. Run `npm install`.
3. Run `supabase/migrations/20260724_phase9_settings.sql` in Supabase SQL Editor.
4. Confirm Phase 4–8 migrations were already applied.
5. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

## Security notes
- API keys are shown once and stored as SHA-256 hashes. The database never stores the full secret.
- Integration metadata fields must not contain secret tokens. Provider OAuth and secrets remain server-side environment variables until Phase 10 provider-specific OAuth flows are connected.
- Phone-number purchase/release actions require carrier credentials and are intentionally not simulated.
