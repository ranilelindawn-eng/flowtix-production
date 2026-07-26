'use client'

import { useState } from 'react'
import type { Contact } from '@/types/contact'

const statusOptions = ['active', 'inactive', 'archived'] as const

type ContactFormState = {
  first_name: string
  last_name: string
  company: string
  email: string
  phone: string
  mobile: string
  job_title: string
  notes: string
  tags: string
  status: typeof statusOptions[number]
  owner_id: string
}

type ContactFormProps = {
  initialValues?: Partial<Contact>
  action: (formData: FormData) => Promise<void>
  hiddenId?: string
  submitLabel: string
}

export default function ContactForm({ initialValues = {}, action, hiddenId, submitLabel }: ContactFormProps) {
  const [form, setForm] = useState<ContactFormState>({
    first_name: initialValues.first_name ?? '',
    last_name: initialValues.last_name ?? '',
    company: initialValues.company ?? '',
    email: initialValues.email ?? '',
    phone: initialValues.phone ?? '',
    mobile: initialValues.metadata?.mobile ?? '',
    job_title: initialValues.title ?? '',
    notes: initialValues.metadata?.notes ?? '',
    tags: (initialValues.metadata?.tags ?? []).join(', '),
    status: initialValues.status ?? 'active',
    owner_id: initialValues.metadata?.owner_id ?? '',
  })

  return (
    <form action={action} method="post" className="space-y-6">
      {hiddenId ? <input type="hidden" name="id" value={hiddenId} /> : null}
      <input type="hidden" name="owner_id" value={form.owner_id} />

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
          <input
            name="company"
            value={form.company}
            onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
            type="text"
            className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0B1726]/90 px-4 py-3 text-white outline-none focus:border-[#22D3EE]/50"
          />
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
      </div>

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
