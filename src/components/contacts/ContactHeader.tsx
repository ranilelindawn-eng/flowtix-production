import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Mail,
  Pencil,
  Phone,
  UserRound,
} from 'lucide-react'

import DeleteContactButton from '@/components/contacts/DeleteContactButton'
import type { Contact } from '@/types/contact'

type ContactHeaderProps = {
  contact: Contact
}

function getFullName(contact: Contact): string {
  return (
    `${contact.first_name} ${contact.last_name}`.trim() ||
    contact.email ||
    'Unnamed contact'
  )
}

function getInitials(contact: Contact): string {
  const initials = [
    contact.first_name,
    contact.last_name,
  ]
    .map((name) => name?.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')

  return initials || 'CF'
}

function getStatusClasses(
  status: Contact['status'],
): string {
  switch (status) {
    case 'active':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'

    case 'inactive':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'

    case 'archived':
      return 'border-slate-400/20 bg-slate-400/10 text-slate-400'

    default:
      return 'border-slate-400/20 bg-slate-400/10 text-slate-400'
  }
}

export default function ContactHeader({
  contact,
}: ContactHeaderProps) {
  const fullName = getFullName(contact)

  const phoneNumber =
    contact.phone?.trim() ||
    contact.metadata?.mobile?.trim() ||
    ''

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0B1726]/90 p-6 shadow-[0_30px_90px_-45px_rgba(13,54,124,0.75)] sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl"
      />

      <div className="relative">
        <Link
          href="/dashboard/contacts"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-4"
          />
          Back to contacts
        </Link>

        <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/15 to-blue-500/10 text-2xl font-semibold text-cyan-200 shadow-[0_16px_40px_-20px_rgba(34,211,238,0.7)]">
              {getInitials(contact)}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
                  Contact profile
                </p>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                    contact.status,
                  )}`}
                >
                  {contact.status}
                </span>
              </div>

              <h1 className="mt-3 truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {fullName}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                {contact.title ? (
                  <span className="inline-flex items-center gap-2">
                    <UserRound
                      aria-hidden="true"
                      className="size-4 text-slate-500"
                    />
                    {contact.title}
                  </span>
                ) : null}

                {contact.company ? (
                  <span className="inline-flex items-center gap-2">
                    <Building2
                      aria-hidden="true"
                      className="size-4 text-slate-500"
                    />
                    {contact.company}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {phoneNumber ? (
              <Link
                href={`/dashboard/dialer?contactId=${encodeURIComponent(
                  contact.id,
                )}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#06111D] transition hover:bg-cyan-300"
              >
                <Phone
                  aria-hidden="true"
                  className="size-4"
                />
                Call
              </Link>
            ) : (
              <span className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-600">
                <Phone
                  aria-hidden="true"
                  className="size-4"
                />
                Call
              </span>
            )}

            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.1] hover:text-white"
              >
                <Mail
                  aria-hidden="true"
                  className="size-4"
                />
                Email
              </a>
            ) : (
              <span className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-sm font-semibold text-slate-600">
                <Mail
                  aria-hidden="true"
                  className="size-4"
                />
                Email
              </span>
            )}

            <Link
              href={`/dashboard/contacts/${contact.id}/edit`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
            >
              <Pencil
                aria-hidden="true"
                className="size-4"
              />
              Edit
            </Link>

            <DeleteContactButton
              contactId={contact.id}
              contactName={fullName}
            />
          </div>
        </div>
      </div>
    </section>
  )
}