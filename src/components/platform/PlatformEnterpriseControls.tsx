'use client'

import { useActionState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Save,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'

import {
  activateEnterpriseAccount,
  createEnterpriseCheckout,
  saveEnterpriseAccount,
  suspendEnterpriseAccount,
  syncEnterprisePayment,
  type EnterpriseActionState,
} from '@/app/platform/enterprise/actions'
import type { PlatformEnterpriseDetail } from '@/lib/platform/enterprise'

const initialState: EnterpriseActionState = {
  status: 'idle',
  message: '',
}

function Message({ state }: { state: EnterpriseActionState }) {
  if (!state.message) return null
  const success = state.status === 'success'

  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        success
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          : 'border-red-400/20 bg-red-400/10 text-red-200'
      }`}
    >
      <div className="flex items-start gap-2">
        {success ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{state.message}</span>
      </div>
    </div>
  )
}

const inputClass =
  'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50'
const textareaClass =
  'mt-2 w-full rounded-xl border border-white/10 bg-[#050D18] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50'

function pesos(value: number | null) {
  return value === null ? '' : String(value / 100)
}

function storageGb(value: number | null) {
  if (value === null) return ''
  return String(Math.round((value / 1024 / 1024 / 1024) * 100) / 100)
}

export default function PlatformEnterpriseControls({
  account,
}: {
  account: PlatformEnterpriseDetail
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveEnterpriseAccount,
    initialState,
  )
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(
    createEnterpriseCheckout,
    initialState,
  )
  const [syncState, syncAction, syncPending] = useActionState(
    syncEnterprisePayment,
    initialState,
  )
  const [activateState, activateAction, activatePending] = useActionState(
    activateEnterpriseAccount,
    initialState,
  )
  const [suspendState, suspendAction, suspendPending] = useActionState(
    suspendEnterpriseAccount,
    initialState,
  )

  const checkoutUrl = checkoutState.checkoutUrl ?? account.paymongoCheckoutUrl
  const isActive = account.onboardingStatus === 'active'
  const isSuspended = account.onboardingStatus === 'suspended'
  const paymentPaid = account.paymentStatus === 'paid'
  const hasUnappliedPaidPayment =
    paymentPaid &&
    Boolean(account.paymongoPaymentId) &&
    account.paymongoPaymentId !== account.lastAppliedPaymentId
  const canActivate =
    (isSuspended &&
      (account.paidPeriodActive || hasUnappliedPaidPayment)) ||
    (isActive && hasUnappliedPaidPayment) ||
    (!isActive &&
      account.onboardingStatus === 'ready' &&
      hasUnappliedPaidPayment)

  return (
    <div className="space-y-6">
      <form
        action={saveAction}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
      >
        <input type="hidden" name="accountId" value={account.id} />

        <div className="flex items-center gap-2">
          <Save className="h-5 w-5 text-blue-300" />
          <div>
            <h2 className="font-semibold text-white">
              Enterprise proposal & custom limits
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              These negotiated limits become the server-enforced capacity after
              Enterprise activation. Later saved limit changes take effect immediately
              without deleting existing customer data.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Contact name
            <input
              className={inputClass}
              name="contactName"
              required
              minLength={2}
              defaultValue={account.contactName}
            />
          </label>

          <label className="text-sm text-slate-300">
            Contact email
            <input
              className={inputClass}
              name="contactEmail"
              required
              type="email"
              defaultValue={account.contactEmail}
            />
          </label>

          <label className="text-sm text-slate-300">
            Company name
            <input
              className={inputClass}
              name="companyName"
              defaultValue={account.companyName ?? ''}
              placeholder="Customer company"
            />
          </label>

          <label className="text-sm text-slate-300">
            Flowtix organization ID
            <input
              className={inputClass}
              name="organizationId"
              defaultValue={account.organizationId ?? ''}
              placeholder="UUID after the customer creates a workspace"
            />
          </label>

          <label className="text-sm text-slate-300">
            Onboarding status
            <select
              className={inputClass}
              name="onboardingStatus"
              defaultValue={account.onboardingStatus}
            >
              <option value="inquiry">Inquiry</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal</option>
              <option value="awaiting_payment">Awaiting payment</option>
              <option value="payment_confirmed">Payment confirmed</option>
              <option value="onboarding">Onboarding</option>
              <option value="ready">Ready</option>
              <option value="active">Active — use Activate action</option>
              <option value="suspended">Suspended — use Suspend action</option>
              <option value="closed">Closed</option>
            </select>
          </label>

          <label className="text-sm text-slate-300">
            Proposed monthly price (PHP)
            <input
              className={inputClass}
              name="proposedMonthlyPricePhp"
              type="number"
              min="1"
              step="0.01"
              defaultValue={pesos(account.proposedMonthlyPriceCents)}
              placeholder="e.g. 45000"
            />
          </label>

          <label className="text-sm text-slate-300">
            Custom user limit
            <input
              className={inputClass}
              name="customMemberLimit"
              type="number"
              min="25"
              step="1"
              defaultValue={account.customMemberLimit ?? ''}
              placeholder="Enterprise activation requires 25+"
            />
          </label>

          <label className="text-sm text-slate-300">
            Custom contact limit
            <input
              className={inputClass}
              name="customContactLimit"
              type="number"
              min="0"
              step="1"
              defaultValue={account.customContactLimit ?? ''}
            />
          </label>

          <label className="text-sm text-slate-300">
            Active campaign limit
            <input
              className={inputClass}
              name="customActiveCampaignLimit"
              type="number"
              min="0"
              step="1"
              defaultValue={account.customActiveCampaignLimit ?? ''}
            />
          </label>

          <label className="text-sm text-slate-300">
            Active sequence limit
            <input
              className={inputClass}
              name="customActiveSequenceLimit"
              type="number"
              min="0"
              step="1"
              defaultValue={account.customActiveSequenceLimit ?? ''}
            />
          </label>

          <label className="text-sm text-slate-300">
            Storage allocation (GB)
            <input
              className={inputClass}
              name="customStorageGb"
              type="number"
              min="0"
              step="0.01"
              defaultValue={storageGb(account.customStorageBytes)}
            />
          </label>

          <label className="text-sm text-slate-300">
            Recording retention (days)
            <input
              className={inputClass}
              name="customRecordingRetentionDays"
              type="number"
              min="0"
              step="1"
              defaultValue={account.customRecordingRetentionDays ?? ''}
            />
          </label>

          <label className="text-sm text-slate-300">
            AI requests / month
            <input
              className={inputClass}
              name="customAiRequestsPerMonth"
              type="number"
              min="0"
              step="1"
              defaultValue={account.customAiRequestsPerMonth ?? ''}
            />
          </label>

          <label className="text-sm text-slate-300">
            Transcription minutes / month
            <input
              className={inputClass}
              name="customTranscriptionMinutesPerMonth"
              type="number"
              min="0"
              step="1"
              defaultValue={account.customTranscriptionMinutesPerMonth ?? ''}
            />
          </label>
        </div>

        <label className="mt-4 block text-sm text-slate-300">
          Contract / reference notes
          <textarea
            className={textareaClass}
            name="contractReferenceNotes"
            rows={6}
            defaultValue={account.contractReferenceNotes ?? ''}
            placeholder="Proposal reference, negotiated terms, contract reference, onboarding notes, approvals, or exceptions."
          />
        </label>

        <div className="mt-5">
          <button
            type="submit"
            disabled={savePending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savePending ? 'Saving...' : 'Save Enterprise configuration'}
          </button>
        </div>

        <div className="mt-4">
          <Message state={saveState} />
        </div>
      </form>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-300" />
          <div>
            <h2 className="font-semibold text-white">
              PayMongo checkout & payment
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enterprise checkout uses the negotiated PHP monthly price. Payment
              confirmation does not activate Enterprise automatically.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#050D18] p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Payment status
            </p>
            <p className="mt-2 font-semibold capitalize text-white">
              {account.paymentStatus.replaceAll('_', ' ')}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#050D18] p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Checkout ID
            </p>
            <p className="mt-2 break-all text-xs text-slate-300">
              {account.paymongoCheckoutId ?? '—'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#050D18] p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Payment ID
            </p>
            <p className="mt-2 break-all text-xs text-slate-300">
              {account.paymongoPaymentId ?? '—'}
            </p>
          </div>
        </div>

        {checkoutUrl ? (
          <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-400/[0.07] p-4">
            <p className="text-sm font-medium text-blue-100">
              Customer checkout link
            </p>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 break-all text-sm text-blue-300 hover:text-blue-200"
            >
              {checkoutUrl}
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <form action={checkoutAction}>
            <input type="hidden" name="accountId" value={account.id} />
            <button
              disabled={checkoutPending || hasUnappliedPaidPayment}
              className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {checkoutPending
                ? 'Creating...'
                : isActive
                  ? 'Create Enterprise renewal checkout'
                  : 'Create Enterprise checkout'}
            </button>
          </form>

          <form action={syncAction}>
            <input type="hidden" name="accountId" value={account.id} />
            <input
              type="hidden"
              name="checkoutId"
              value={account.paymongoCheckoutId ?? ''}
            />
            <button
              disabled={syncPending || !account.paymongoCheckoutId}
              className="min-h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              {syncPending ? 'Syncing...' : 'Sync PayMongo payment'}
            </button>
          </form>
        </div>

        <div className="mt-4 space-y-3">
          <Message state={checkoutState} />
          <Message state={syncState} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          action={activateAction}
          className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-6"
        >
          <input type="hidden" name="accountId" value={account.id} />
          <input
            type="hidden"
            name="organizationId"
            value={account.organizationId ?? ''}
          />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h2 className="font-semibold text-white">
              {isSuspended
                ? 'Reactivate Enterprise'
                : isActive
                  ? 'Apply Enterprise renewal'
                  : 'Activate Enterprise'}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Initial activation requires onboarding status Ready, a linked
            organization, verified paid PayMongo checkout, and complete negotiated
            limits. Activation switches the subscription to Enterprise and immediately
            enforces these custom limits.
          </p>
          <textarea
            name="reason"
            required
            minLength={10}
            rows={3}
            placeholder="Activation/onboarding approval reason"
            className={textareaClass}
          />
          <button
            disabled={activatePending || !canActivate}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {activatePending
              ? 'Applying...'
              : isSuspended
                ? 'Reactivate Enterprise'
                : isActive
                  ? 'Apply paid Enterprise renewal'
                  : 'Activate Enterprise'}
          </button>
          <div className="mt-4">
            <Message state={activateState} />
          </div>
        </form>

        <form
          action={suspendAction}
          className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-6"
        >
          <input type="hidden" name="accountId" value={account.id} />
          <input
            type="hidden"
            name="organizationId"
            value={account.organizationId ?? ''}
          />
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-red-300" />
            <h2 className="font-semibold text-white">Suspend Enterprise</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Suspension blocks subscription-backed feature and quota usage without
            deleting customer data or the negotiated Enterprise configuration.
          </p>
          <textarea
            name="reason"
            required
            minLength={10}
            rows={3}
            placeholder="Suspension reason"
            className={textareaClass}
          />
          <button
            disabled={suspendPending || !isActive}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 text-sm font-semibold text-red-200 hover:bg-red-400/15 disabled:opacity-50"
          >
            <ShieldOff className="h-4 w-4" />
            {suspendPending ? 'Suspending...' : 'Suspend Enterprise'}
          </button>
          <div className="mt-4">
            <Message state={suspendState} />
          </div>
        </form>
      </section>
    </div>
  )
}
