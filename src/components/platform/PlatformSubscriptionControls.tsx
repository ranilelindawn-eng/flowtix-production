'use client'

import { useActionState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, XCircle } from 'lucide-react'

import {
  cancelPlatformScheduledPlanChange,
  schedulePlatformSubscriptionPlanChange,
  setPlatformSubscriptionCancellation,
} from '@/app/platform/subscriptions/actions'
import type { PlatformSubscriptionPlan } from '@/lib/platform/subscriptions'

const initialPlatformSubscriptionActionState = {
  status: 'idle' as const,
  message: '',
}

type Props = {
  subscriptionId: string
  organizationId: string
  organizationName: string
  currentPlanCode: string | null
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  scheduledPlanCode: string | null
  scheduledPlanEffectiveAt: string | null
  pendingCheckout: boolean
  plans: PlatformSubscriptionPlan[]
}

function Message({ state }: { state: { status: string; message: string } }) {
  if (!state.message) return null
  const success = state.status === 'success'
  return (
    <div className={`rounded-xl border p-4 text-sm ${success ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-red-400/20 bg-red-400/10 text-red-200'}`}>
      <div className="flex items-start gap-2">
        {success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{state.message}</span>
      </div>
    </div>
  )
}

export default function PlatformSubscriptionControls(props: Props) {
  const [planState, planAction, planPending] = useActionState(
    schedulePlatformSubscriptionPlanChange,
    initialPlatformSubscriptionActionState,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    setPlatformSubscriptionCancellation,
    initialPlatformSubscriptionActionState,
  )
  const [scheduledState, scheduledAction, scheduledPending] = useActionState(
    cancelPlatformScheduledPlanChange,
    initialPlatformSubscriptionActionState,
  )

  const canSchedulePlan =
    (props.status === 'active' || props.status === 'trialing') &&
    Boolean(props.currentPeriodEnd) &&
    !props.cancelAtPeriodEnd &&
    !props.pendingCheckout &&
    !props.scheduledPlanCode

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 text-blue-300" />
          <div>
            <h2 className="font-semibold text-white">Plan management</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Schedule a paid plan change for the end of the current billing period. Flowtix does not directly overwrite the active plan; PayMongo payment remains required before activation.
            </p>
          </div>
        </div>

        {props.scheduledPlanCode ? (
          <div className="mt-5 rounded-xl border border-blue-400/20 bg-blue-400/[0.07] p-4">
            <p className="text-sm font-medium text-blue-100">
              Scheduled plan: <span className="capitalize">{props.scheduledPlanCode}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Effective target: {props.scheduledPlanEffectiveAt ?? 'current billing-period end'}
            </p>
            <form action={scheduledAction} className="mt-4 space-y-3">
              <input type="hidden" name="subscriptionId" value={props.subscriptionId} />
              <input type="hidden" name="organizationId" value={props.organizationId} />
              <textarea name="reason" required minLength={10} rows={3} placeholder="Reason for cancelling this scheduled plan change" className="w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50" />
              <button type="submit" disabled={scheduledPending} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 text-sm font-semibold text-red-200 hover:bg-red-400/15 disabled:opacity-50">
                <XCircle className="h-4 w-4" /> {scheduledPending ? 'Cancelling...' : 'Cancel scheduled change'}
              </button>
              <Message state={scheduledState} />
            </form>
          </div>
        ) : (
          <form action={planAction} className="mt-5 space-y-4">
            <input type="hidden" name="subscriptionId" value={props.subscriptionId} />
            <input type="hidden" name="organizationId" value={props.organizationId} />
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Target PayMongo plan</span>
              <select name="planCode" required disabled={!canSchedulePlan} defaultValue="" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50">
                <option value="" disabled>Select a plan</option>
                {props.plans.filter((plan) => plan.code !== props.currentPlanCode).map((plan) => (
                  <option key={plan.id} value={plan.code}>
                    {plan.name} — ₱{(plan.monthlyPriceCents / 100).toLocaleString('en-PH')}/month
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Platform action reason</span>
              <textarea name="reason" required minLength={10} rows={3} disabled={!canSchedulePlan} placeholder={`Explain why ${props.organizationName} should change plans.`} className="mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 disabled:opacity-50" />
            </label>
            {!canSchedulePlan ? (
              <p className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-100">
                A plan change cannot be scheduled while cancellation, a PayMongo checkout, another scheduled plan, or an unsupported subscription state is active.
              </p>
            ) : null}
            <button type="submit" disabled={!canSchedulePlan || planPending} className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
              {planPending ? 'Scheduling...' : 'Schedule plan change'}
            </button>
            <Message state={planState} />
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-semibold text-white">Cancellation management</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Schedule or revoke end-of-period cancellation. This never deletes payment history or rewrites completed PayMongo transactions.
        </p>
        <form action={cancelAction} className="mt-5 space-y-4">
          <input type="hidden" name="subscriptionId" value={props.subscriptionId} />
          <input type="hidden" name="organizationId" value={props.organizationId} />
          <input type="hidden" name="cancelAtPeriodEnd" value={props.cancelAtPeriodEnd ? 'false' : 'true'} />
          <textarea name="reason" required minLength={10} rows={3} placeholder={props.cancelAtPeriodEnd ? 'Reason for revoking the scheduled cancellation' : 'Reason for scheduling subscription cancellation'} className="w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600" />
          <button type="submit" disabled={cancelPending} className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50 ${props.cancelAtPeriodEnd ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
            {cancelPending ? 'Applying...' : props.cancelAtPeriodEnd ? 'Revoke scheduled cancellation' : 'Schedule cancellation'}
          </button>
          <Message state={cancelState} />
        </form>
      </section>
    </div>
  )
}
