# Flowtix implementation status — 2026-07-26

This source package is an implementation snapshot, not a claim that every external provider is production-certified.

## Implemented in this build

- Bulk CSV contact import at `/dashboard/contacts/import`.
- CSV parsing with quoted-field support and common-header auto-mapping.
- Preview before import, 5,000-row request limit, duplicate-email skipping, validation, batch inserts, and import summary.
- Downloadable example CSV in `public/flowtix-contacts-import-template.csv`.
- Clickable dashboard KPI cards linked to contacts, calls, reports, and campaigns.
- Owner-paid workspace foundation: invited members do not require individual subscriptions.
- Roles: Owner, Admin, Manager, Supervisor, Agent.
- Server-side permission map for the Supervisor role.
- Team invitation and role-management UI updated for Supervisor.
- Supabase migration removing member/invitation seat-limit triggers and expanding role constraints.

## Already present in the uploaded project

The repository already contains public marketing routes, authentication, protected dashboard routes, contacts, companies, campaigns, calls, dialer routes, recordings, transcripts, summaries, AI endpoints, team invitations, permissions, Stripe endpoints, reports, settings, security pages, and Supabase RLS/migrations.

## Provider-dependent and not truthfully certifiable without live accounts

- Twilio/Telnyx/Vonage/Plivo/SIP calling and phone-number provisioning.
- Browser WebRTC production calling, inbound routing, transfers, conferencing, voicemail, and queues under real traffic.
- Stripe checkout, portal, invoices, coupons, and webhook lifecycle.
- AI transcription, summaries, coaching, scoring, and drafting with a configured provider.
- Google/Microsoft calendar and workspace OAuth.
- SMS, WhatsApp, email delivery, Slack, Zoom, QuickBooks, HubSpot, Salesforce, Zapier, Make, and n8n.
- SSO, 2FA, backup/recovery, SOC 2 evidence, and production security monitoring.

These require credentials, provider dashboards, callback URLs, regulatory configuration, and end-to-end testing. UI or API scaffolding alone must not be represented as a production-certified integration.

## Required database step

Apply all existing Supabase migrations, including:

`supabase/migrations/20260726_owner_paid_workspace_roles.sql`

before using Supervisor roles or the owner-paid/free-member model.
