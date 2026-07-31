# Flowtix Phase 7 — Reports

## Added

- Sales dashboard
- Call performance reporting
- Agent reporting
- Conversion reporting
- Revenue and weighted pipeline reporting
- Activity reporting
- Team-performance table
- 7-day, 30-day, 90-day, and annual report periods
- Tenant-scoped queries using the authenticated organization
- Database indexes for reporting performance

## Install

Copy this package over the Phase 6 project and allow matching files to be replaced.

Run the migration in Supabase SQL Editor:

```text
supabase/migrations/20260724_phase7_reports.sql
```

Then run:

```powershell
npm install
npx tsc --noEmit
npm run lint
npm run build
npm run dev
```

Open:

```text
http://localhost:3000/dashboard/reports
```

## Reporting rules

Revenue is calculated from opportunities whose status is `won`. Open pipeline value is calculated from open opportunities. Weighted pipeline value multiplies each open opportunity by its close probability. Conversion is won deals divided by won plus lost deals. Agent performance is attributed through call `created_by`, opportunity `owner_id` (falling back to `created_by`), task assignment, and activity creator fields.

All queries include the current `organization_id`, and existing RLS remains enabled.
