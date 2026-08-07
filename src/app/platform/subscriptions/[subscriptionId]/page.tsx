import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, CreditCard, RefreshCcw, ShieldCheck } from 'lucide-react'

import PlatformSubscriptionControls from '@/components/platform/PlatformSubscriptionControls'
import { getPlatformSubscription, getPlatformSubscriptionPlans } from '@/lib/platform/subscriptions'

function date(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

export default async function PlatformSubscriptionDetailPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  const [subscription, plans] = await Promise.all([
    getPlatformSubscription(subscriptionId),
    getPlatformSubscriptionPlans(),
  ])
  if (!subscription) notFound()

  return (
    <div className="space-y-8">
      <section>
        <Link href="/platform/subscriptions" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to subscriptions</Link>
        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-300">PayMongo subscription</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{subscription.organizationName}</h1>
            <p className="mt-2 text-sm text-slate-500">{subscription.id}</p>
          </div>
          <Link href={`/platform/customers/${subscription.organizationId}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/5">Open customer 360</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><CreditCard className="h-5 w-5 text-blue-300" /><p className="mt-4 text-sm text-slate-500">Current plan</p><p className="mt-1 text-xl font-semibold text-white">{subscription.planName}</p><p className="mt-1 text-xs text-slate-500">₱{(subscription.monthlyPriceCents / 100).toLocaleString('en-PH')}/month</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><ShieldCheck className="h-5 w-5 text-blue-300" /><p className="mt-4 text-sm text-slate-500">Status</p><p className="mt-1 text-xl font-semibold capitalize text-white">{subscription.status.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">Last payment: {subscription.lastPaymentStatus ?? '—'}</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><CalendarClock className="h-5 w-5 text-blue-300" /><p className="mt-4 text-sm text-slate-500">Period end</p><p className="mt-1 text-sm font-semibold text-white">{date(subscription.currentPeriodEnd)}</p></article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><RefreshCcw className="h-5 w-5 text-blue-300" /><p className="mt-4 text-sm text-slate-500">Lifecycle version</p><p className="mt-1 text-xl font-semibold text-white">{subscription.lifecycleVersion}</p><p className="mt-1 text-xs text-slate-500">Failures: {subscription.paymentFailureCount}</p></article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <PlatformSubscriptionControls
          subscriptionId={subscription.id}
          organizationId={subscription.organizationId}
          organizationName={subscription.organizationName}
          currentPlanCode={subscription.planCode}
          status={subscription.status}
          currentPeriodEnd={subscription.currentPeriodEnd}
          cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
          scheduledPlanCode={subscription.scheduledPlanCode}
          scheduledPlanEffectiveAt={subscription.scheduledPlanEffectiveAt}
          pendingCheckout={subscription.pendingCheckout}
          plans={plans}
        />

        <div className="space-y-6">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="font-semibold text-white">Provider state</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="text-slate-500">Billing provider</dt><dd className="mt-1 capitalize text-slate-200">{subscription.billingProvider}</dd></div>
              <div><dt className="text-slate-500">Pending checkout</dt><dd className="mt-1 text-slate-200">{subscription.pendingCheckout ? 'Yes' : 'No'}</dd></div>
              <div><dt className="text-slate-500">Grace period ends</dt><dd className="mt-1 text-slate-200">{date(subscription.gracePeriodEndsAt)}</dd></div>
              <div><dt className="text-slate-500">Activated</dt><dd className="mt-1 text-slate-200">{date(subscription.activatedAt)}</dd></div>
              <div><dt className="text-slate-500">Cancelled</dt><dd className="mt-1 text-slate-200">{date(subscription.cancelledAt)}</dd></div>
            </dl>
          </article>
          <article className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-5 text-sm leading-6 text-slate-400">
            Platform Subscription Management never fabricates a successful PayMongo payment and never directly activates an unpaid target plan. Payment events, invoices, webhook replay, and reconciliation remain in the dedicated Billing & PayMongo Operations phase.
          </article>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5"><h2 className="font-semibold text-white">Subscription lifecycle</h2><p className="mt-1 text-sm text-slate-500">Customer, system, PayMongo webhook, and Platform subscription actions.</p></div>
        {subscription.lifecycle.length === 0 ? <div className="px-6 py-10 text-sm text-slate-500">No lifecycle events recorded.</div> : (
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-white/10 text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-4 font-medium">Event</th><th className="px-6 py-4 font-medium">Source</th><th className="px-6 py-4 font-medium">Transition</th><th className="px-6 py-4 font-medium">Plan</th><th className="px-6 py-4 font-medium">Time</th></tr></thead><tbody className="divide-y divide-white/10">{subscription.lifecycle.map((event) => <tr key={event.id}><td className="px-6 py-4 text-slate-200">{event.eventType.replaceAll('_', ' ')}</td><td className="px-6 py-4 text-slate-400">{event.source.replaceAll('_', ' ')}</td><td className="px-6 py-4 text-slate-400">{event.previousStatus ?? '—'} → {event.newStatus ?? '—'}</td><td className="px-6 py-4 text-slate-400">{event.planCode ?? '—'}</td><td className="whitespace-nowrap px-6 py-4 text-slate-500">{date(event.createdAt)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  )
}
