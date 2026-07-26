import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'

import type { Contact } from '@/types/contact'

type ContactTableProps = {
  contacts: Contact[]
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function getContactName(contact: Contact): string {
  const fullName =
    `${contact.first_name} ${contact.last_name}`.trim()

  return fullName || 'Unnamed contact'
}

function getStatusClasses(status: Contact['status']): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'

    case 'inactive':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'

    case 'archived':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

export default function ContactTable({
  contacts,
}: ContactTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 px-6 py-16 text-center shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-xl font-semibold text-blue-400">
          +
        </div>

        <h2 className="mt-4 text-lg font-semibold text-white">
          No contacts found
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Add your first contact or change your search filters to
          view matching contacts.
        </p>

        <Link
          href="/dashboard/contacts/new"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Create contact
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[950px] w-full table-auto text-left text-sm">
          <thead className="border-b border-white/10 bg-[#07111F]/80 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-semibold">Name</th>
              <th className="px-6 py-4 font-semibold">Company</th>
              <th className="px-6 py-4 font-semibold">Phone</th>
              <th className="px-6 py-4 font-semibold">Email</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold">Created</th>
              <th className="px-6 py-4 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5 text-slate-300">
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className="transition hover:bg-white/[0.03]"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/contacts/${contact.id}`}
                    className="font-medium text-white transition hover:text-cyan-300"
                  >
                    {getContactName(contact)}
                  </Link>

                  {contact.title ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {contact.title}
                    </p>
                  ) : null}
                </td>

                <td className="px-6 py-4">
                  {contact.company ?? '—'}
                </td>

                <td className="px-6 py-4">
                  {contact.phone ?? '—'}
                </td>

                <td className="max-w-64 truncate px-6 py-4">
                  {contact.email || '—'}
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                      contact.status,
                    )}`}
                  >
                    {contact.status}
                  </span>
                </td>

                <td className="px-6 py-4 text-slate-400">
                  {formatDate(contact.created_at)}
                </td>

                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/dashboard/contacts/${contact.id}/edit`}
                    aria-label={`Edit ${getContactName(contact)}`}
                    title={`Edit ${getContactName(contact)}`}
                    className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <MoreHorizontal
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-white/10 md:hidden">
        {contacts.map((contact) => (
          <article key={contact.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/contacts/${contact.id}`}
                  className="block truncate font-semibold text-white transition hover:text-cyan-300"
                >
                  {getContactName(contact)}
                </Link>

                <p className="mt-1 truncate text-sm text-slate-400">
                  {contact.email || 'No email'}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                  contact.status,
                )}`}
              >
                {contact.status}
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Company</dt>
                <dd className="mt-1 truncate text-slate-200">
                  {contact.company ?? '—'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="mt-1 truncate text-slate-200">
                  {contact.phone ?? '—'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Job title</dt>
                <dd className="mt-1 truncate text-slate-200">
                  {contact.title ?? '—'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="mt-1 text-slate-200">
                  {formatDate(contact.created_at)}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex items-center gap-4">
              <Link
                href={`/dashboard/contacts/${contact.id}`}
                className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
              >
                View contact
              </Link>

              <Link
                href={`/dashboard/contacts/${contact.id}/edit`}
                className="text-sm font-medium text-slate-400 transition hover:text-white"
              >
                Edit
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}