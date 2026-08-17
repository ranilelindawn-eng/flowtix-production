'use client'

import { useActionState, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileSignature,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Upload,
} from 'lucide-react'

import {
  cancelExistingCompanySmsNumberRequest,
  submitExistingCompanySmsNumber,
  type BusinessSmsActionState,
} from '@/app/dashboard/organization/actions'

const initialState: BusinessSmsActionState = { status: 'idle', message: '' }

type RequestSummary = {
  id: string
  phoneNumber: string
  status: string
  statusLabel: string
  providerNote: string | null
  submittedAt: string
  providerSubmittedAt: string | null
}

type NumberType = '10dlc' | 'toll_free'

function stateClasses(status: string) {
  if (status === 'active') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (status === 'rejected') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-200'
  }
  if (status === 'action_required') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50'

export default function BusinessSmsNumberCard({
  isOwner,
  activePhoneNumber,
  currentRequest,
}: {
  isOwner: boolean
  activePhoneNumber: string | null
  currentRequest: RequestSummary | null
}) {
  const [showForm, setShowForm] = useState(!activePhoneNumber && !currentRequest)
  const [numberType, setNumberType] = useState<NumberType>('10dlc')
  const [submitState, submitAction, submitPending] = useActionState(
    submitExistingCompanySmsNumber,
    initialState,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelExistingCompanySmsNumberRequest,
    initialState,
  )

  const pendingRequest = currentRequest && currentRequest.status !== 'active'
  const loaHref =
    numberType === 'toll_free'
      ? '/forms/signalwire/signalwire-toll-free-loa.pdf'
      : '/forms/signalwire/signalwire-local-tn-loa.pdf'
  const loaLabel = numberType === 'toll_free' ? 'Toll-Free LOA' : 'Local TN LOA'

  return (
    <section
      id="business-sms"
      className="scroll-mt-24 rounded-3xl border border-white/10 bg-slate-950/60 p-6 sm:p-7"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-cyan-300" />
            <p className="text-sm font-medium text-cyan-300">Business messaging</p>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Company SMS number</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            Use an approved company number as the sender for manual SMS, post-call follow-up,
            campaigns, and sequences. Customer replies return to Flowtix and stay attached to
            the matching CRM contact.
          </p>
        </div>

        {activePhoneNumber ? (
          <div className="min-w-[260px] rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              Active SMS sender
            </div>
            <p className="mt-2 text-xl font-semibold text-white">{activePhoneNumber}</p>
            <p className="mt-1 text-xs text-emerald-100/70">
              Outbound SMS and inbound replies ready
            </p>
          </div>
        ) : (
          <div className="min-w-[260px] rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Phone className="h-4 w-4" />
              No active company sender
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Flowtix will keep using the existing SMS-capable workspace number until a company
              number becomes active.
            </p>
          </div>
        )}
      </div>

      {currentRequest ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Provisioning request
              </p>
              <p className="mt-2 text-lg font-semibold text-white">{currentRequest.phoneNumber}</p>
              <p className="mt-1 text-xs text-slate-500">Submitted {currentRequest.submittedAt}</p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateClasses(currentRequest.status)}`}
            >
              {currentRequest.statusLabel}
            </span>
          </div>

          {currentRequest.providerNote ? (
            <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100/80">
              {currentRequest.providerNote}
            </div>
          ) : null}

          {currentRequest.status === 'provider_submission_required' ? (
            <div className="mt-4 flex items-start gap-3 text-sm text-slate-400">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <p>
                Flowtix Platform will validate your documents and submit the Messaging Services
                Only request to SignalWire. Your existing voice service stays with its current
                provider.
              </p>
            </div>
          ) : null}

          {currentRequest.status === 'provider_processing' ? (
            <div className="mt-4 flex items-start gap-3 text-sm text-slate-400">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <p>
                SignalWire is processing this number. Flowtix will activate it only after the
                number appears as SMS-capable in the provider account.
              </p>
            </div>
          ) : null}

          {isOwner &&
          (currentRequest.status === 'provider_submission_required' ||
            currentRequest.status === 'action_required') ? (
            <form action={cancelAction} className="mt-5">
              <input type="hidden" name="request_id" value={currentRequest.id} />
              <button
                type="submit"
                disabled={cancelPending}
                className="rounded-xl border border-rose-400/20 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel request'}
              </button>
              {cancelState.message ? (
                <p
                  className={`mt-3 text-sm ${
                    cancelState.status === 'error' ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {cancelState.message}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}

      {!isOwner ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm leading-6 text-slate-400">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
          <p>
            Only the workspace owner can submit or replace the company SMS number. Team members
            can use the active sender through Flowtix messaging features.
          </p>
        </div>
      ) : null}

      {isOwner && !pendingRequest ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-xl border border-blue-400/25 bg-blue-400/10 px-4 py-2.5 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
          >
            {showForm
              ? 'Hide company-number form'
              : activePhoneNumber
                ? 'Replace with another company number'
                : 'Use my existing company number'}
          </button>

          {showForm ? (
            <form
              action={submitAction}
              className="mt-5 space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6"
            >
              <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div className="text-sm leading-6 text-amber-100/80">
                    <p className="font-semibold text-amber-100">
                      Provider authorization is required before activation.
                    </p>
                    <p className="mt-1">
                      This workflow is for eligible local/10DLC or Toll-Free VoIP numbers whose
                      voice service remains with another provider. Do not submit a mobile/wireless
                      number. Flowtix requests Messaging Services Only and does not move your voice
                      service.
                    </p>
                  </div>
                </div>
              </div>

              <section className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Number and contact
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-white">Company number details</h3>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Existing company number</span>
                    <input
                      required
                      name="phone_number"
                      placeholder="+14155550123"
                      className={inputClass}
                    />
                    <span className="block text-xs text-slate-500">
                      Use E.164 format with country code.
                    </span>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Number type</span>
                    <select
                      required
                      name="number_type"
                      value={numberType}
                      onChange={(event) => setNumberType(event.target.value as NumberType)}
                      className={inputClass}
                    >
                      <option value="10dlc">Local VoIP / 10DLC</option>
                      <option value="toll_free">Toll-Free</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Current voice provider</span>
                    <input
                      required
                      name="voice_provider_name"
                      placeholder="Example: RingCentral"
                      className={inputClass}
                    />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Company website</span>
                    <input
                      name="company_website"
                      type="url"
                      placeholder="https://example.com"
                      className={inputClass}
                    />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Authorized contact name</span>
                    <input required name="authorized_contact_name" className={inputClass} />
                    <span className="block text-xs text-slate-500">
                      Flowtix contact for questions about this provisioning request.
                    </span>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Authorized contact email</span>
                    <input
                      required
                      name="authorized_contact_email"
                      type="email"
                      className={inputClass}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Current carrier account
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-white">
                    Information used for the SignalWire request
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Enter these values exactly as they appear with the current phone provider. They
                    are used by Flowtix Platform to complete the SignalWire Messaging Services Only
                    submission.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Provider account number</span>
                    <input required name="provider_account_number" className={inputClass} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Account type</span>
                    <select required name="account_type" defaultValue="business" className={inputClass}>
                      <option value="business">Business</option>
                      <option value="residential">Residential</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Authorized name on account</span>
                    <input required name="authorized_name_on_account" className={inputClass} />
                    <span className="block text-xs text-slate-500">
                      Legal first and last name authorized with the current provider.
                    </span>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Billing phone number</span>
                    <input
                      required
                      name="billing_phone_number"
                      placeholder="As shown on the provider account"
                      className={inputClass}
                    />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">End user / business name</span>
                    <input required name="end_user_name" className={inputClass} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Provider account PIN</span>
                    <input
                      required
                      name="provider_account_pin"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Enter PIN or N/A"
                      className={inputClass}
                    />
                    <span className="block text-xs text-slate-500">
                      Encrypted before storage. Enter N/A if the current provider has no account PIN.
                    </span>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300 lg:col-span-2 xl:col-span-3">
                    <span className="font-medium text-white">Phone service address</span>
                    <textarea
                      required
                      name="phone_service_address"
                      rows={3}
                      placeholder="Physical service address on file with the current provider"
                      className={`${inputClass} resize-y`}
                    />
                  </label>

                  {numberType === '10dlc' ? (
                    <label className="space-y-2 text-sm text-slate-300 lg:col-span-2 xl:col-span-3">
                      <span className="font-medium text-white">10DLC Campaign ID</span>
                      <input
                        required
                        name="tcr_campaign_id"
                        placeholder="CXXXXXX or N/A when not applicable"
                        className={inputClass}
                      />
                      <span className="block text-xs leading-5 text-slate-500">
                        US local VoIP numbers need an active SignalWire 10DLC campaign. Enter its
                        Campaign ID beginning with C. Use N/A only when 10DLC does not apply.
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="tcr_campaign_id" value="N/A" />
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">SMS use case</span>
                    <textarea
                      required
                      name="use_case"
                      rows={5}
                      placeholder="Describe who you message and why."
                      className={`${inputClass} resize-y`}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Sample message</span>
                    <textarea
                      required
                      name="sample_message"
                      rows={5}
                      placeholder="Example customer-facing SMS."
                      className={`${inputClass} resize-y`}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">How customers opt in</span>
                    <textarea
                      required
                      name="opt_in_description"
                      rows={5}
                      placeholder="Explain how consent is collected before messaging."
                      className={`${inputClass} resize-y`}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-5">
                <div className="flex items-start gap-3">
                  <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                  <div>
                    <h3 className="font-semibold text-white">Letter of Authorization</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Use the official SignalWire form for the selected number type. The authorized
                      account holder should complete and sign it, then upload the signed copy below.
                      Keep the existing voice service active with the current provider.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Step 1
                    </p>
                    <p className="mt-2 font-medium text-white">Download {loaLabel}</p>
                    <a
                      href={loaHref}
                      download
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-400/25 bg-blue-400/10 px-3 py-2 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
                    >
                      <Download className="h-4 w-4" />
                      Download official LOA
                    </a>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Step 2
                    </p>
                    <p className="mt-2 font-medium text-white">Complete and sign</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Use the carrier account information exactly as it appears on the provider bill.
                      Review every statement on the official form and sign only if it is accurate for
                      your account. If any SignalWire-account wording does not apply, contact Flowtix
                      support before signing. Flowtix Platform handles the provider-side submission.
                    </p>
                  </div>

                  <label className="rounded-xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Step 3
                    </span>
                    <span className="mt-2 flex items-center gap-2 font-medium text-white">
                      <Upload className="h-4 w-4 text-cyan-300" />
                      Upload signed LOA
                    </span>
                    <input
                      required
                      name="loa_document"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      className="mt-3 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-2 file:text-blue-200"
                    />
                    <span className="mt-2 block text-xs text-slate-500">
                      PDF, JPG, or PNG. Maximum 10 MB.
                    </span>
                  </label>
                </div>
              </section>

              <label className="block rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
                <span className="flex items-center gap-2 font-medium text-white">
                  <FileCheck2 className="h-4 w-4 text-cyan-300" />
                  Recent provider invoice
                </span>
                <input
                  required
                  name="provider_invoice"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="mt-3 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-2 file:text-blue-200"
                />
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  Upload a recent bill showing the phone number, billing name, account number, and
                  service address whenever available.
                </span>
              </label>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                  <input required type="checkbox" name="ownership_authorized" className="mt-1" />
                  <span>
                    I confirm that my organization owns this number or is authorized to provision
                    messaging for it.
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                  <input
                    required
                    type="checkbox"
                    name="provider_split_authorized"
                    className="mt-1"
                  />
                  <span>
                    I confirm that the current voice provider permits messaging to be hosted
                    separately while voice service remains active and unchanged.
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={submitPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  {submitPending ? 'Submitting…' : 'Submit provisioning request'}
                </button>
                {submitState.message ? (
                  <p
                    className={`text-sm ${
                      submitState.status === 'error' ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {submitState.message}
                  </p>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
