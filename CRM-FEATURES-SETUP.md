# Flowtix Phase 3 — CRM Features

This package is based on the completed Phase 2 Cloud Dialer package and adds the Phase 3 CRM modules.

## Included

- Companies list, creation, details, linked contacts, comments, mentions, and attachments
- Pipelines and pipeline stages
- Opportunities with value, probability, company/contact links, and stage changes
- Organization-scoped tags
- Email integration through Resend
- SMS integration through Twilio
- Communication history and delivery/error logging
- Existing campaigns preserved
- Sequences and first-step automation records
- Email/SMS templates
- Reusable snippets
- Internal comments and mention records
- Private Supabase Storage bucket for files and attachments
- Tenant-aware RLS for every Phase 3 table
- Updated dashboard navigation

## Installation

1. Back up your current Flowtix folder.
2. Extract this ZIP.
3. Copy all contents into your existing Flowtix project and allow Windows to replace matching files.
4. Run:

```powershell
npm install
```

5. Open Supabase SQL Editor and run:

```text
supabase/migrations/20260724_phase3_crm_features.sql
```

6. Add the following to `.env.local`:

```env
RESEND_API_KEY=re_your_actual_key
RESEND_FROM_EMAIL=Flowtix <noreply@your-verified-domain.com>
```

SMS uses the Twilio values already configured for Phase 2:

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

7. Restart the development server:

```powershell
npm run dev
```

8. Validate:

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

## Provider notes

- Resend requires a verified sender or domain before production email delivery.
- Twilio trial accounts can only send SMS to verified recipient numbers.
- Email and SMS sends are recorded even when the provider rejects the message, so failures can be diagnosed from the Email & SMS page.
- The attachment bucket is private. The SQL migration creates organization-based Storage RLS policies.

## New dashboard routes

- `/dashboard/companies`
- `/dashboard/pipelines`
- `/dashboard/tags`
- `/dashboard/communications`
- `/dashboard/sequences`
- `/dashboard/templates`
- `/dashboard/snippets`
- `/dashboard/files`

## Current implementation boundary

The sequence database and UI are included. Automatic background execution of sequence steps requires a scheduled worker or cron endpoint in a later deployment/integrations phase. Campaign records from the existing application are preserved and can be connected to sequences through later automation rules.
