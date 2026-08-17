'use client'

import { useActionState, type ReactNode } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  RefreshCcw,
  Send,
} from 'lucide-react'

import {
  syncAndActivatePlatformSmsSender,
  updatePlatformSmsSenderProvisioning,
  type PlatformTelephonyActionState,
} from '@/app/platform/telephony/actions'
import type { PlatformSmsSenderRequest } from '@/lib/platform/sms-provisioning'

const initialState: PlatformTelephonyActionState = { status: 'idle', message: '' }

const date = (value: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(parsed)
}

const statusClass = (status: string) => {
  if (status === 'active') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  if (status === 'rejected') return 'border-rose-400/20 bg-rose-400/10 text-rose-200'
  if (status === 'action_required') return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-slate-300">{children}</dd>
    </div>
  )
}

function Card({
  request,
  integrationId,
}: {
  request: PlatformSmsSenderRequest
  integrationId: string
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    updatePlatformSmsSenderProvisioning,
    initialState,
  )
  const [syncState, syncAction, syncPending] = useActionState(
    syncAndActivatePlatformSmsSender,
    initialState,
  )

  const mutable = !['active', 'cancelled', 'replaced', 'rejected'].includes(request.status)

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold text-white">{request.phoneNumber}</p>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(request.status)}`}
            >
              {request.status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {request.numberType.toUpperCase()} · voice remains with {request.voiceProviderName}
          </p>
        </div>
        <div className="text-xs text-slate-500 xl:text-right">
          <p>Submitted {date(request.submittedAt)}</p>
          <p className="mt-1">Provider submission {date(request.providerSubmittedAt)}</p>
          <p className="mt-1">Activated {date(request.activatedAt)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 text-sm lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Authorized contact</p>
          <p className="mt-2 text-slate-200">{request.authorizedContactName}</p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {request.authorizedContactEmail}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Documents</p>
          <div className="mt-2 space-y-2">
            <a
              href={`/platform/telephony/sms-documents/${request.id}/loa`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-blue-300 hover:text-blue-200"
            >
              <FileText className="h-4 w-4" />
              Signed LOA <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`/platform/telephony/sms-documents/${request.id}/invoice`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-blue-300 hover:text-blue-200"
            >
              <FileText className="h-4 w-4" />
              Provider invoice <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-slate-500">Provider state</p>
          <p className="mt-2 text-slate-200">{request.providerStatus ?? 'Not submitted'}</p>
          <p className="mt-1 text-xs text-slate-500">
            Reference: {request.providerSubmissionReference ?? '—'}
          </p>
          {request.providerNote ? (
            <p className="mt-2 text-xs leading-5 text-slate-400">{request.providerNote}</p>
          ) : null}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          SignalWire submission details
        </summary>

        <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4 text-sm">
          <p className="font-semibold text-cyan-100">Services to Port: Messaging Services Only</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Do not move or disconnect the subscriber&apos;s existing voice service. Keep voice active
            with the current provider throughout Hosted Messaging provisioning.
          </p>
        </div>

        <dl className="mt-4 grid gap-4 text-sm lg:grid-cols-2 xl:grid-cols-3">
          <Value label="Current provider">{request.voiceProviderName}</Value>
          <Value label="Provider account number">{request.providerAccountNumber ?? '—'}</Value>
          <Value label="Account type">{request.accountType ?? '—'}</Value>
          <Value label="Authorized name on account">
            {request.authorizedNameOnAccount ?? '—'}
          </Value>
          <Value label="Billing phone number">{request.billingPhoneNumber ?? '—'}</Value>
          <Value label="End user / company">{request.endUserName ?? '—'}</Value>
          <div className="lg:col-span-2 xl:col-span-3">
            <Value label="Phone service address">{request.phoneServiceAddress ?? '—'}</Value>
          </div>
          <Value label="10DLC Campaign ID">{request.tcrCampaignId ?? '—'}</Value>
          <Value label="Website">{request.companyWebsite ?? '—'}</Value>
          <div>
            <dt className="text-slate-500">Provider account PIN</dt>
            <dd className="mt-2">
              <a
                href={`/platform/telephony/sms-secrets/${request.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/10"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Reveal provider PIN
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
          <div className="lg:col-span-2 xl:col-span-3">
            <Value label="SMS use case">{request.useCase}</Value>
          </div>
          <Value label="Sample message">{request.sampleMessage}</Value>
          <div className="lg:col-span-2">
            <Value label="Opt-in description">{request.optInDescription}</Value>
          </div>
        </dl>
      </details>

      {mutable ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <form action={updateAction} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="integrationId" value={integrationId} />
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="text-xs text-slate-400">
                Status
                <select
                  name="status"
                  defaultValue="provider_processing"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="provider_processing">Submitted / processing</option>
                  <option value="action_required">Action required</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">
                SignalWire reference
                <input
                  name="providerReference"
                  defaultValue={request.providerSubmissionReference ?? ''}
                  placeholder="Optional ticket/reference"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                Operator note / reason
                <input
                  required
                  minLength={5}
                  name="reason"
                  defaultValue={request.providerNote ?? ''}
                  placeholder="Submitted in SignalWire dashboard…"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <button
              disabled={updatePending}
              type="submit"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-sm font-medium text-blue-200 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {updatePending ? 'Saving…' : 'Save provider status'}
            </button>
            {updateState.message ? (
              <p
                className={`mt-3 text-xs ${
                  updateState.status === 'error' ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {updateState.message}
              </p>
            ) : null}
          </form>

          <form action={syncAction} className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="organizationId" value={request.organizationId} />
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <RefreshCcw className="h-4 w-4" />
              Provider sync
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Checks SignalWire for the exact number. Activation succeeds only when it exists and
              reports SMS capability, then Flowtix configures the inbound webhook automatically.
            </p>
            <button
              disabled={syncPending}
              type="submit"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {syncPending ? 'Checking…' : 'Sync & activate'}
            </button>
            {syncState.message ? (
              <p
                className={`mt-3 text-xs ${
                  syncState.status === 'error' ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {syncState.message}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </article>
  )
}

export default function PlatformSmsProvisioningControls({
  requests,
  integrationId,
}: {
  requests: PlatformSmsSenderRequest[]
  integrationId: string
}) {
  return (
    <section
      id="sms-provisioning"
      className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.025] p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
            Hosted messaging
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Existing company SMS numbers</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            Subscriber requests are collected in Flowtix. Platform staff submit Messaging Services
            Only in SignalWire, then use Sync &amp; activate after SignalWire adds the SMS-capable
            number to the account.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1 text-xs text-slate-400">
          {requests.length} request{requests.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-500">
            No company SMS provisioning requests for this organization.
          </div>
        ) : (
          requests.map((request) => (
            <Card key={request.id} request={request} integrationId={integrationId} />
          ))
        )}
      </div>
    </section>
  )
}
