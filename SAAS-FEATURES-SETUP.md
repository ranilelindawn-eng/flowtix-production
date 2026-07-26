# CallFlow Phase 5 — SaaS Features Setup

This phase adds production-oriented Stripe subscriptions, plan changes, tenant isolation, and database-enforced usage limits.

## 1. Merge the package

Copy the contents of this folder into your existing CallFlow project and allow matching files to be replaced. Keep your existing `.env.local`.

## 2. Install packages

```powershell
npm install
```

## 3. Run the migration

Run this file in the Supabase SQL Editor after the Phase 2, 3, and 4 migrations:

```text
supabase/migrations/20260724_phase5_saas_features.sql
```

## 4. Create Stripe recurring prices

Create monthly Stripe prices for Starter and Pro. Enterprise uses Contact Sales and does not require a public Checkout price.

Update the database:

```sql
update public.subscription_plans
set stripe_price_id = 'price_YOUR_STARTER_PRICE'
where code = 'starter';

update public.subscription_plans
set stripe_price_id = 'price_1TwQIl6cyF0WQmxGAccLmtMR'
where code = 'pro';
```

The migration hides the previous Free and Business plans from new selection while preserving existing subscriptions using them.

## 5. Environment variables

Add these to `.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_1TwQIl6cyF0WQmxGAccLmtMR
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=...
```

Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` in browser code or GitHub.

## 6. Stripe webhook

For local testing:

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the returned `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

Production webhook URL:

```text
https://YOUR-DOMAIN.com/api/stripe/webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## 7. Plan limits included

Starter:

- 2 team members, including pending invitations
- 500 contacts
- 1 GB private attachment storage
- 500 calls per month

Pro:

- 10 team members
- Unlimited contacts
- 25 GB private attachment storage
- 5,000 calls per month

Enterprise:

- Unlimited team members
- Unlimited contacts
- Unlimited storage
- Unlimited calls

Change these values directly in `subscription_plans` when your final commercial limits are decided.

## 8. Tenant isolation

Core subscriber records use `organization_id` with RLS membership checks. Supabase Storage paths must begin with the organization UUID. The migration explicitly hardens contacts, calls, notes, tasks, attachments, and private storage policies.

## 9. Validation

```powershell
npx tsc --noEmit
npm run lint
npm run build
npm run dev
```

Test with two separate accounts in different organizations. Account A must not be able to query, update, delete, or download Account B's records or files.
