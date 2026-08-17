'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
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

type BusinessSmsFieldName =
  | 'phone_number'
  | 'number_type'
  | 'voice_provider_name'
  | 'company_website'
  | 'authorized_contact_name'
  | 'authorized_contact_email'
  | 'provider_account_number'
  | 'account_type'
  | 'authorized_name_on_account'
  | 'billing_phone_number'
  | 'end_user_name'
  | 'provider_account_pin'
  | 'phone_service_address'
  | 'tcr_campaign_id'
  | 'use_case'
  | 'sample_message'
  | 'opt_in_description'
  | 'loa_document'
  | 'provider_invoice'
  | 'ownership_authorized'
  | 'provider_split_authorized'

type BusinessSmsFieldErrors = Partial<Record<BusinessSmsFieldName, string>>

const fieldOrder: BusinessSmsFieldName[] = [
  'phone_number',
  'number_type',
  'voice_provider_name',
  'company_website',
  'authorized_contact_name',
  'authorized_contact_email',
  'provider_account_number',
  'account_type',
  'authorized_name_on_account',
  'billing_phone_number',
  'end_user_name',
  'provider_account_pin',
  'phone_service_address',
  'tcr_campaign_id',
  'use_case',
  'sample_message',
  'opt_in_description',
  'loa_document',
  'provider_invoice',
  'ownership_authorized',
  'provider_split_authorized',
]

const fieldLabels: Record<BusinessSmsFieldName, string> = {
  phone_number: 'Existing company number',
  number_type: 'Number type',
  voice_provider_name: 'Current voice provider',
  company_website: 'Company website',
  authorized_contact_name: 'Authorized contact name',
  authorized_contact_email: 'Authorized contact email',
  provider_account_number: 'Provider account number',
  account_type: 'Account type',
  authorized_name_on_account: 'Authorized name on account',
  billing_phone_number: 'Billing phone number',
  end_user_name: 'End user / business name',
  provider_account_pin: 'Provider account PIN',
  phone_service_address: 'Phone service address',
  tcr_campaign_id: '10DLC Campaign ID',
  use_case: 'SMS use case',
  sample_message: 'Sample message',
  opt_in_description: 'How customers opt in',
  loa_document: 'Signed Letter of Authorization',
  provider_invoice: 'Recent provider invoice',
  ownership_authorized: 'Number ownership authorization',
  provider_split_authorized: 'Messaging separation authorization',
}

const allowedDocumentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const maxDocumentSize = 10 * 1024 * 1024

function textValue(formData: FormData, name: BusinessSmsFieldName) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function selectedFile(formData: FormData, name: BusinessSmsFieldName) {
  const value = formData.get(name)
  return value instanceof File && value.size > 0 ? value : null
}

function lengthError(value: string, label: string, min: number, max: number) {
  if (!value) return `${label} is required.`
  if (value.length < min) return `${label} must contain at least ${min} characters.`
  if (value.length > max) return `${label} must be ${max} characters or fewer.`
  return undefined
}

function documentError(file: File | null, label: string) {
  if (!file) return `${label} is required.`
  if (file.size > maxDocumentSize) return `${label} must be 10 MB or smaller.`
  if (!allowedDocumentTypes.has(file.type)) return `${label} must be a PDF, JPG, or PNG file.`
  return undefined
}

function validateBusinessSmsField(
  name: BusinessSmsFieldName,
  formData: FormData,
): string | undefined {
  const numberType = textValue(formData, 'number_type')
  const value = textValue(formData, name)

  switch (name) {
    case 'phone_number': {
      if (!value) return 'Enter the existing company phone number.'
      if (!/^\+[1-9]\d{7,14}$/.test(value)) {
        return 'Use E.164 format with a leading + and country code, for example +14155550123.'
      }
      if (
        numberType === '10dlc' &&
        (!/^\+1\d{10}$/.test(value) || /^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(value))
      ) {
        return 'Local VoIP / 10DLC requires an eligible +1 US local VoIP number. Mobile/wireless, Toll-Free, and non-US numbers cannot use this option.'
      }
      if (
        numberType === 'toll_free' &&
        !/^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(value)
      ) {
        return 'Toll-Free requires a +1 number using 800, 833, 844, 855, 866, 877, or 888.'
      }
      return undefined
    }
    case 'number_type':
      return value === '10dlc' || value === 'toll_free'
        ? undefined
        : 'Select Local VoIP / 10DLC or Toll-Free.'
    case 'voice_provider_name':
      return lengthError(value, 'Current voice provider', 2, 120)
    case 'company_website': {
      if (!value) return undefined
      try {
        const parsed = new URL(value)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
        return undefined
      } catch {
        return 'Enter the full website URL including https://, for example https://example.com.'
      }
    }
    case 'authorized_contact_name':
      return lengthError(value, 'Authorized contact name', 2, 160)
    case 'authorized_contact_email':
      if (!value) return 'Authorized contact email is required.'
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320
        ? undefined
        : 'Enter a valid email address, for example owner@example.com.'
    case 'provider_account_number':
      return lengthError(value, 'Provider account number', 1, 120)
    case 'account_type':
      return value === 'business' || value === 'residential'
        ? undefined
        : 'Select Business or Residential.'
    case 'authorized_name_on_account':
      return lengthError(value, 'Authorized name on account', 2, 160)
    case 'billing_phone_number':
      return lengthError(value, 'Billing phone number', 7, 40)
    case 'end_user_name':
      return lengthError(value, 'End user / business name', 2, 200)
    case 'provider_account_pin':
      if (!value) return 'Enter the provider account PIN, or enter N/A if the provider has no PIN.'
      return value.length <= 128 ? undefined : 'Provider account PIN must be 128 characters or fewer.'
    case 'phone_service_address':
      return lengthError(value, 'Phone service address', 5, 500)
    case 'tcr_campaign_id': {
      if (numberType === 'toll_free') return undefined
      const normalized = value.toUpperCase()
      if (!normalized) return 'Enter the 10DLC Campaign ID, or N/A only when 10DLC does not apply.'
      if (normalized === 'N/A') return undefined
      return /^C[A-Z0-9_-]{5,79}$/.test(normalized)
        ? undefined
        : 'Campaign ID must begin with C and contain at least 6 characters, for example CABC123.'
    }
    case 'use_case':
      return lengthError(value, 'SMS use case', 10, 2000)
    case 'sample_message':
      return lengthError(value, 'Sample message', 5, 1600)
    case 'opt_in_description':
      return lengthError(value, 'Opt-in description', 10, 2000)
    case 'loa_document':
      return documentError(selectedFile(formData, name), 'Signed Letter of Authorization')
    case 'provider_invoice':
      return documentError(selectedFile(formData, name), 'Recent provider invoice')
    case 'ownership_authorized':
      return formData.get(name) === 'on'
        ? undefined
        : 'Confirm that your organization owns the number or is authorized to provision messaging for it.'
    case 'provider_split_authorized':
      return formData.get(name) === 'on'
        ? undefined
        : 'Confirm that the current voice provider permits messaging to be hosted separately.'
    default:
      return undefined
  }
}

function validateBusinessSmsForm(formData: FormData): BusinessSmsFieldErrors {
  const errors: BusinessSmsFieldErrors = {}
  for (const field of fieldOrder) {
    const error = validateBusinessSmsField(field, formData)
    if (error) errors[field] = error
  }
  return errors
}

function isBusinessSmsFieldName(value: string): value is BusinessSmsFieldName {
  return fieldOrder.includes(value as BusinessSmsFieldName)
}

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

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span className="block text-xs font-medium leading-5 text-rose-300" role="alert">
      {message}
    </span>
  )
}

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
  const formRef = useRef<HTMLFormElement>(null)
  const [fieldErrors, setFieldErrors] = useState<BusinessSmsFieldErrors>({})
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
  const errorEntries = fieldOrder
    .filter((field) => Boolean(fieldErrors[field]))
    .map((field) => [field, fieldErrors[field] as string] as const)

  const updateFieldValidation = (field: BusinessSmsFieldName) => {
    const form = formRef.current
    if (!form) return
    const error = validateBusinessSmsField(field, new FormData(form))
    setFieldErrors((current) => {
      const next = { ...current }
      if (error) next[field] = error
      else delete next[field]
      return next
    })
  }

  const focusField = (field: BusinessSmsFieldName) => {
    const element = formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => element.focus({ preventScroll: true }), 250)
  }

  useEffect(() => {
    const form = formRef.current
    if (!form) return

    for (const field of fieldOrder) {
      const controls = form.querySelectorAll<HTMLElement>(`[name="${field}"]`)
      for (const control of controls) {
        const error = fieldErrors[field]
        if (error) {
          control.setAttribute('aria-invalid', 'true')
          control.setAttribute('title', error)
        } else {
          control.removeAttribute('aria-invalid')
          control.removeAttribute('title')
        }
      }
    }
  }, [fieldErrors, showForm, numberType])

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
              ref={formRef}
              action={submitAction}
              noValidate
              onBlurCapture={(event) => {
                const target = event.target
                if (
                  !(target instanceof HTMLInputElement) &&
                  !(target instanceof HTMLSelectElement) &&
                  !(target instanceof HTMLTextAreaElement)
                ) {
                  return
                }

                if (target.name && isBusinessSmsFieldName(target.name)) {
                  updateFieldValidation(target.name)
                }
              }}
              onChangeCapture={(event) => {
                const target = event.target
                if (
                  !(target instanceof HTMLInputElement) &&
                  !(target instanceof HTMLSelectElement) &&
                  !(target instanceof HTMLTextAreaElement)
                ) {
                  return
                }

                if (!target.name || !isBusinessSmsFieldName(target.name)) return

                if (fieldErrors[target.name]) updateFieldValidation(target.name)
                if (target.name === 'number_type') {
                  window.setTimeout(() => {
                    updateFieldValidation('phone_number')
                    updateFieldValidation('tcr_campaign_id')
                  }, 0)
                }
              }}
              onSubmit={(event) => {
                const errors = validateBusinessSmsForm(new FormData(event.currentTarget))
                if (Object.keys(errors).length === 0) {
                  setFieldErrors({})
                  return
                }

                event.preventDefault()
                setFieldErrors(errors)
                const firstField = fieldOrder.find((field) => Boolean(errors[field]))
                if (firstField) window.setTimeout(() => focusField(firstField), 0)
              }}
              className="mt-5 space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6 [&_[aria-invalid='true']]:border-rose-400/70 [&_[aria-invalid='true']]:ring-1 [&_[aria-invalid='true']]:ring-rose-400/30"
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

              {errorEntries.length > 0 ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.07] p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-rose-100">
                        Fix {errorEntries.length} {errorEntries.length === 1 ? 'field' : 'fields'} before submitting
                      </p>
                      <p className="mt-1 text-sm leading-6 text-rose-100/70">
                        Each invalid field is highlighted. Select an item below to jump directly to it.
                      </p>
                      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
                        {errorEntries.map(([field, message]) => (
                          <li key={field}>
                            <button
                              type="button"
                              onClick={() => focusField(field)}
                              className="w-full rounded-xl border border-rose-400/15 bg-slate-950/50 px-3 py-2 text-left text-sm transition hover:border-rose-300/30 hover:bg-rose-400/[0.06]"
                            >
                              <span className="font-semibold text-rose-200">{fieldLabels[field]}:</span>{' '}
                              <span className="text-rose-100/75">{message}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}

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
                    <FieldError message={fieldErrors.phone_number} />
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
                    <FieldError message={fieldErrors.number_type} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Current voice provider</span>
                    <input
                      required
                      name="voice_provider_name"
                      placeholder="Example: RingCentral"
                      className={inputClass}
                    />
                    <FieldError message={fieldErrors.voice_provider_name} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Company website</span>
                    <input
                      name="company_website"
                      type="url"
                      placeholder="https://example.com"
                      className={inputClass}
                    />
                    <FieldError message={fieldErrors.company_website} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Authorized contact name</span>
                    <input required name="authorized_contact_name" className={inputClass} />
                    <span className="block text-xs text-slate-500">
                      Flowtix contact for questions about this provisioning request.
                    </span>
                    <FieldError message={fieldErrors.authorized_contact_name} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Authorized contact email</span>
                    <input
                      required
                      name="authorized_contact_email"
                      type="email"
                      className={inputClass}
                    />
                    <FieldError message={fieldErrors.authorized_contact_email} />
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
                    <FieldError message={fieldErrors.provider_account_number} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Account type</span>
                    <select required name="account_type" defaultValue="business" className={inputClass}>
                      <option value="business">Business</option>
                      <option value="residential">Residential</option>
                    </select>
                    <FieldError message={fieldErrors.account_type} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Authorized name on account</span>
                    <input required name="authorized_name_on_account" className={inputClass} />
                    <span className="block text-xs text-slate-500">
                      Legal first and last name authorized with the current provider.
                    </span>
                    <FieldError message={fieldErrors.authorized_name_on_account} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">Billing phone number</span>
                    <input
                      required
                      name="billing_phone_number"
                      placeholder="As shown on the provider account"
                      className={inputClass}
                    />
                    <FieldError message={fieldErrors.billing_phone_number} />
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span className="font-medium text-white">End user / business name</span>
                    <input required name="end_user_name" className={inputClass} />
                    <FieldError message={fieldErrors.end_user_name} />
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
                    <FieldError message={fieldErrors.provider_account_pin} />
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
                    <FieldError message={fieldErrors.phone_service_address} />
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
                      <FieldError message={fieldErrors.tcr_campaign_id} />
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
                    <FieldError message={fieldErrors.use_case} />
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
                    <FieldError message={fieldErrors.sample_message} />
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
                    <FieldError message={fieldErrors.opt_in_description} />
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
                    <FieldError message={fieldErrors.loa_document} />
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
                <FieldError message={fieldErrors.provider_invoice} />
              </label>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                  <input required type="checkbox" name="ownership_authorized" className="mt-1" />
                  <span>
                    I confirm that my organization owns this number or is authorized to provision
                    messaging for it.
                    <FieldError message={fieldErrors.ownership_authorized} />
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
                    <FieldError message={fieldErrors.provider_split_authorized} />
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
