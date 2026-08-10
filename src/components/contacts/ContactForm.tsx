'use client'

import { useState } from 'react'
import type { Contact, ContactLifecycleStage } from '@/types/contact'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
import { toOrganizationDateTimeLocal } from '@/lib/timezone'
const statusOptions = ['active', 'inactive', 'archived'] as const
const consentStatusOptions = ['unknown', 'granted', 'denied', 'revoked', 'opted_out'] as const

type ConsentStatus = typeof consentStatusOptions[number]

type ContactFormState = {
  first_name: string
  last_name: string
  company: string
  company_id: string
  email: string
  phone: string
  mobile: string
  job_title: string
  notes: string
  tags: string
  status: typeof statusOptions[number]
  owner_membership_id: string
  preferred_name: string
  lifecycle_stage: ContactLifecycleStage
  source: string
  lead_score: string
  timezone: string
  locale: string
  do_not_email: boolean
  do_not_sms: boolean
  do_not_call: boolean
  next_follow_up_at: string
  email_consent_status: ConsentStatus
  sms_consent_status: ConsentStatus
  call_consent_status: ConsentStatus
}

export type ContactOwnerOption = {
  id: string
  full_name: string
}

export type ContactCompanyOption = {
  id: string
  name: string
}

export type ContactCommunicationPreferences = {
  email_consent_status: ConsentStatus
  sms_consent_status: ConsentStatus
  call_consent_status: ConsentStatus
}

type ContactFormProps = {
  initialValues?: Partial<Contact>
  action: (formData: FormData) => Promise<void>
  hiddenId?: string
  submitLabel: string
  ownerOptions: ContactOwnerOption[]
  companyOptions: ContactCompanyOption[]
  canAssignOthers: boolean
  initialCommunicationPreferences?: ContactCommunicationPreferences
}

export default function ContactForm({
  initialValues = {},
  action,
  hiddenId,
  submitLabel,
  ownerOptions,
  companyOptions,
  canAssignOthers,
  initialCommunicationPreferences,
}: ContactFormProps) {
  const timeZone = useOrganizationTimezone()
  const [form, setForm] = useState<ContactFormState>({
    first_name: initialValues.first_name ?? '',
    last_name: initialValues.last_name ?? '',
    company: initialValues.company ?? '',
    company_id: initialValues.company_id ?? '',
    email: initialValues.email ?? '',
    phone: initialValues.phone ?? '',
    mobile: initialValues.metadata?.mobile ?? '',
    job_title: initialValues.title ?? '',
    notes: initialValues.metadata?.notes ?? '',
    tags: (initialValues.metadata?.tags ?? []).join(', '),
    status: initialValues.status ?? 'active',
    owner_membership_id: initialValues.owner_membership_id ?? ownerOptions[0]?.id ?? '',
    preferred_name: initialValues.preferred_name ?? '',
    lifecycle_stage: initialValues.lifecycle_stage ?? 'lead',
    source: initialValues.source ?? 'manual',
    lead_score: String(initialValues.lead_score ?? 0),
    timezone: initialValues.timezone ?? '',
    locale: initialValues.locale ?? '',
    do_not_email: initialValues.do_not_email ?? false,
    do_not_sms: initialValues.do_not_sms ?? false,
    do_not_call: initialValues.do_not_call ?? false,
    next_follow_up_at: initialValues.next_follow_up_at
      ? toOrganizationDateTimeLocal(initialValues.next_follow_up_at, timeZone)
      : '',
    email_consent_status: initialCommunicationPreferences?.email_consent_status ?? 'unknown',
    sms_consent_status: initialCommunicationPreferences?.sms_consent_status ?? 'unknown',
    call_consent_status: initialCommunicationPreferences?.call_consent_status ?? 'unknown',
  })

  return (
    <form action={action} className="space-y-6">
      {hiddenId ? <input type="hidden" name="id" value={hiddenId} /> : null}


      <div className="grid gap-6 md:grid-cols-2">
        <label className="block">
          <span className="text-sm text-slate-300">First name</span>
          <input
            name="first_name"
            value={form.first_name}
            onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
            type="text"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Last name</span>
          <input
            name="last_name"
            value={form.last_name}
            onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
            type="text"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Company</span>
          <input type="hidden" name="company" value={form.company} />
          <select
            name="company_id"
            value={form.company_id}
            onChange={(event) => {
              const companyId = event.target.value
              const selectedCompany = companyOptions.find((company) => company.id === companyId)

              setForm((previous) => ({
                ...previous,
                company_id: companyId,
                company: selectedCompany?.name ?? '',
              }))
            }}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          >
            <option value="" className="bg-[#07111F] text-white">
              {form.company && !form.company_id
                ? `${form.company} (unlinked)`
                : 'No linked company'}
            </option>
            {companyOptions.map((company) => (
              <option
                key={company.id}
                value={company.id}
                className="bg-[#07111F] text-white"
              >
                {company.name}
              </option>
            ))}
          </select>
          {form.company && !form.company_id ? (
            <p className="mt-2 text-xs text-amber-300/80">
              This existing company value is text only. Select a company above to link this contact to a company record.
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Email</span>
          <input
            name="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            type="email"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Phone</span>
          <input
            name="phone"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            type="tel"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Mobile</span>
          <input
            name="mobile"
            value={form.mobile}
            onChange={(event) => setForm((prev) => ({ ...prev, mobile: event.target.value }))}
            type="tel"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Job title</span>
          <input
            name="job_title"
            value={form.job_title}
            onChange={(event) => setForm((prev) => ({ ...prev, job_title: event.target.value }))}
            type="text"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Status</span>
          <select
            name="status"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as typeof statusOptions[number] }))}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option} className="bg-[#07111F] text-white">
                {option}
              </option>
            ))}
          </select>
        </label>


        <label className="block">
          <span className="text-sm text-slate-300">Preferred name</span>
          <input
            name="preferred_name"
            value={form.preferred_name}
            onChange={(event) => setForm((previous) => ({ ...previous, preferred_name: event.target.value }))}
            type="text"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Lifecycle stage</span>
          <select
            name="lifecycle_stage"
            value={form.lifecycle_stage}
            onChange={(event) => setForm((previous) => ({ ...previous, lifecycle_stage: event.target.value as ContactLifecycleStage }))}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          >
            {[
              ['lead', 'Lead'],
              ['marketing_qualified', 'Marketing qualified'],
              ['sales_qualified', 'Sales qualified'],
              ['opportunity', 'Opportunity'],
              ['customer', 'Customer'],
              ['evangelist', 'Evangelist'],
              ['inactive', 'Inactive'],
            ].map(([value, label]) => (
              <option key={value} value={value} className="bg-[#07111F] text-white">
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Source</span>
          <input
            name="source"
            value={form.source}
            onChange={(event) => setForm((previous) => ({ ...previous, source: event.target.value }))}
            type="text"
            placeholder="manual, website, referral, campaign"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Lead score</span>
          <input
            name="lead_score"
            value={form.lead_score}
            onChange={(event) => setForm((previous) => ({ ...previous, lead_score: event.target.value }))}
            type="number"
            min={0}
            max={100}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Timezone</span>
          <input
            name="timezone"
            value={form.timezone}
            onChange={(event) => setForm((previous) => ({ ...previous, timezone: event.target.value }))}
            type="text"
            placeholder="Asia/Manila"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Locale</span>
          <input
            name="locale"
            value={form.locale}
            onChange={(event) => setForm((previous) => ({ ...previous, locale: event.target.value }))}
            type="text"
            placeholder="en-PH"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Next follow-up</span>
          <input
            name="next_follow_up_at"
            value={form.next_follow_up_at}
            onChange={(event) => setForm((previous) => ({ ...previous, next_follow_up_at: event.target.value }))}
            type="datetime-local"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Assigned owner</span>
          <select
            name="owner_membership_id"
            value={form.owner_membership_id}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                owner_membership_id: event.target.value,
              }))
            }
            disabled={!canAssignOthers && ownerOptions.length <= 1}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {ownerOptions.map((owner) => (
              <option
                key={owner.id}
                value={owner.id}
                className="bg-[#07111F] text-white"
              >
                {owner.full_name}
              </option>
            ))}
          </select>
          {!canAssignOthers ? (
            <p className="mt-2 text-xs text-slate-500">
              Agents can assign contacts only to themselves.
            </p>
          ) : null}
        </label>
      </div>


      {hiddenId ? (
        <fieldset className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
          <legend className="px-2 text-sm font-semibold text-white">Automation consent</legend>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Record the contact&apos;s consent status for automated outreach. Choose Granted only when you have a valid consent record or other evidence required by your policy.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ['email_consent_status', 'Email consent'],
              ['sms_consent_status', 'SMS consent'],
              ['call_consent_status', 'Call consent'],
            ].map(([field, label]) => (
              <label key={field} className="block">
                <span className="text-sm text-slate-300">{label}</span>
                <select
                  name={field}
                  value={form[field as 'email_consent_status' | 'sms_consent_status' | 'call_consent_status']}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      [field]: event.target.value as ConsentStatus,
                    }))
                  }
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
                >
                  {consentStatusOptions.map((option) => (
                    <option key={option} value={option} className="bg-[#07111F] text-white">
                      {option === 'opted_out'
                        ? 'Opted out'
                        : option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <legend className="px-2 text-sm font-semibold text-white">Communication restrictions</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ['do_not_email', 'Do not email'],
            ['do_not_sms', 'Do not SMS'],
            ['do_not_call', 'Do not call'],
          ].map(([field, label]) => (
            <label key={field} className="flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                name={field}
                value="true"
                checked={form[field as 'do_not_email' | 'do_not_sms' | 'do_not_call']}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    [field]: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-white/20 bg-[#07111F]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm text-slate-300">Tags</span>
        <input
          name="tags"
          value={form.tags}
          onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
          type="text"
          placeholder="sales, vip, partner"
          className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-300">Notes</span>
        <textarea
          name="notes"
          value={form.notes}
          onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          rows={5}
          className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
        />
      </label>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5"
      >
        {submitLabel}
      </button>
    </form>
  )
}
