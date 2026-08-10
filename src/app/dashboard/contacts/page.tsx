import Link from 'next/link'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  Phone,
  Plus,
  Search,
  Upload,
  UserRound,
} from 'lucide-react'

import {
  CONTACTS_PER_PAGE,
  getContacts,
} from '@/lib/contacts'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Contact } from '@/types/contact'

type ContactsPageProps = {
  searchParams: Promise<{
    search?: string | string[]
    sort?: string | string[]
    page?: string | string[]
  }>
}

function getSingleParam(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function normalizePage(value: string): number {
  const page = Number.parseInt(value, 10)

  if (!Number.isFinite(page) || page < 1) {
    return 1
  }

  return page
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
    .map((name) => name.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')

  return initials || '?'
}

function getStatusClasses(
  status: Contact['status'],
): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'

    case 'inactive':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300'

    case 'archived':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

function buildContactsUrl(input: {
  search: string
  sort: string
  page: number
}): string {
  const params = new URLSearchParams()

  if (input.search) {
    params.set('search', input.search)
  }

  if (input.sort && input.sort !== 'created_at') {
    params.set('sort', input.sort)
  }

  if (input.page > 1) {
    params.set('page', String(input.page))
  }

  const query = params.toString()

  return query
    ? `/dashboard/contacts?${query}`
    : '/dashboard/contacts'
}

export default async function ContactsPage({
  searchParams,
}: ContactsPageProps) {
  const resolvedSearchParams = await searchParams

  const organization = await requirePermission('contacts.view')
  const canManageCsv =
    organization.role === 'owner' ||
    organization.role === 'admin'

  const search = getSingleParam(
    resolvedSearchParams.search,
  ).trim()

  const sort =
    getSingleParam(resolvedSearchParams.sort) ||
    'created_at'

  const requestedPage = normalizePage(
    getSingleParam(resolvedSearchParams.page),
  )

  const { contacts, count } = await getContacts(
    search,
    sort,
    requestedPage,
  )

  const contactIds = contacts.map((contact) => contact.id)
  const tagsByContact = new Map<
    string,
    Array<{ id: string; name: string; color: string | null }>
  >()

  if (contactIds.length > 0) {
    const supabase = await createClient()
    const { data: tagAssignments, error: tagAssignmentsError } =
      await supabase
        .from('entity_tags')
        .select('entity_id,tag:tags(id,name,color,is_active)')
        .eq('organization_id', organization.organization_id)
        .eq('entity_type', 'contact')
        .in('entity_id', contactIds)

    if (tagAssignmentsError) {
      throw new Error(
        `Failed to load contact tags: ${tagAssignmentsError.message}`,
      )
    }

    for (const assignment of tagAssignments ?? []) {
      const tag = assignment.tag as unknown as
        | {
            id: string
            name: string
            color: string | null
            is_active: boolean
          }
        | null

      if (!tag?.is_active) continue

      const current = tagsByContact.get(assignment.entity_id) ?? []
      current.push({ id: tag.id, name: tag.name, color: tag.color })
      tagsByContact.set(assignment.entity_id, current)
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil(count / CONTACTS_PER_PAGE),
  )

  const currentPage = Math.min(
    requestedPage,
    totalPages,
  )

  const firstContactNumber =
    count === 0
      ? 0
      : (currentPage - 1) * CONTACTS_PER_PAGE + 1

  const lastContactNumber = Math.min(
    currentPage * CONTACTS_PER_PAGE,
    count,
  )

  const previousUrl = buildContactsUrl({
    search,
    sort,
    page: Math.max(1, currentPage - 1),
  })

  const nextUrl = buildContactsUrl({
    search,
    sort,
    page: Math.min(totalPages, currentPage + 1),
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">
            CRM workspace
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Contacts
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Manage customer records and start calls directly
            from your contact database.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {canManageCsv ? (
            <>
              <a
                href="/api/contacts/import/sample"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <Download aria-hidden="true" className="size-4" />
                Download sample CSV
              </a>
              <Link
                href="/dashboard/contacts/import"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <Upload aria-hidden="true" className="size-4" />
                Import CSV
              </Link>
            </>
          ) : null}
          <Link
            href="/dashboard/contacts/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Plus aria-hidden="true" className="size-4" />
            Add contact
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
        <form
          method="get"
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"
        >
          <label className="relative block">
            <span className="sr-only">
              Search contacts
            </span>

            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />

            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Search name, email, phone, or company"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] py-2 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <label>
            <span className="sr-only">
              Sort contacts
            </span>

            <select
              name="sort"
              defaultValue={sort}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-slate-200 outline-none transition focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="created_at">
                Newest first
              </option>
              <option value="updated_at">
                Recently updated
              </option>
              <option value="first_name">
                First name
              </option>
              <option value="last_name">
                Last name
              </option>
              <option value="company">
                Company
              </option>
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.09] hover:text-white"
          >
            Apply
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B1726]/90 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-white">
              Contact directory
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {count === 0
                ? 'No contacts found'
                : `${count} contact${count === 1 ? '' : 's'} in your organization`}
            </p>
          </div>

          {search ? (
            <Link
              href="/dashboard/contacts"
              className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
            >
              Clear search
            </Link>
          ) : null}
        </div>

        {contacts.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4">
                      Contact
                    </th>
                    <th className="px-5 py-4">
                      Company
                    </th>
                    <th className="px-5 py-4">
                      Phone
                    </th>
                    <th className="px-5 py-4">
                      Status
                    </th>
                    <th className="px-5 py-4">
                      Tags
                    </th>
                    <th className="px-5 py-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {contacts.map((contact) => {
                    const fullName = getFullName(contact)
                    const phoneNumber =
                      contact.phone?.trim() ||
                      contact.metadata.mobile?.trim() ||
                      ''

                    const contactTags = tagsByContact.get(contact.id) ?? []
                    const visibleTags = contactTags.slice(0, 3)
                    const hiddenTagCount = Math.max(
                      0,
                      contactTags.length - visibleTags.length,
                    )

                    return (
                      <tr
                        key={contact.id}
                        className="transition hover:bg-white/[0.025]"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/dashboard/contacts/${contact.id}`}
                            className="group flex items-center gap-3"
                          >
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-sm font-semibold text-blue-300">
                              {getInitials(contact)}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white transition group-hover:text-blue-300">
                                {fullName}
                              </p>

                              <p className="mt-1 truncate text-xs text-slate-500">
                                {contact.email || 'No email'}
                              </p>
                            </div>
                          </Link>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Building2
                              aria-hidden="true"
                              className="size-4 shrink-0 text-slate-600"
                            />
                            <span className="max-w-48 truncate">
                              {contact.company || '—'}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-sm text-slate-300">
                            {phoneNumber || '—'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                              contact.status,
                            )}`}
                          >
                            {contact.status}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          {contactTags.length > 0 ? (
                            <div className="flex max-w-64 flex-wrap items-center gap-1.5">
                              {visibleTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex max-w-40 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200"
                                  title={tag.name}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: tag.color || '#64748b' }}
                                  />
                                  <span className="truncate">{tag.name}</span>
                                </span>
                              ))}
                              {hiddenTagCount > 0 ? (
                                <span
                                  className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-400"
                                  title={`${hiddenTagCount} more tag${hiddenTagCount === 1 ? '' : 's'}`}
                                >
                                  +{hiddenTagCount}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-600">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {phoneNumber ? (
                              <Link
                                href={`/dashboard/dialer?contactId=${encodeURIComponent(
                                  contact.id,
                                )}`}
                                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                              >
                                <Phone
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                                Call
                              </Link>
                            ) : (
                              <span className="inline-flex min-h-9 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 text-xs font-semibold text-slate-600">
                                <Phone
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                                Call
                              </span>
                            )}

                            <Link
                              href={`/dashboard/contacts/${contact.id}`}
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-white/10 md:hidden">
              {contacts.map((contact) => {
                const fullName = getFullName(contact)
                const phoneNumber =
                  contact.phone?.trim() ||
                  contact.metadata.mobile?.trim() ||
                  ''

                const contactTags = tagsByContact.get(contact.id) ?? []
                const visibleTags = contactTags.slice(0, 3)
                const hiddenTagCount = Math.max(
                  0,
                  contactTags.length - visibleTags.length,
                )

                return (
                  <article
                    key={contact.id}
                    className="p-5"
                  >
                    <Link
                      href={`/dashboard/contacts/${contact.id}`}
                      className="flex items-start gap-3"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-sm font-semibold text-blue-300">
                        {getInitials(contact)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white">
                          {fullName}
                        </p>

                        <p className="mt-1 truncate text-sm text-slate-500">
                          {contact.email || 'No email'}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                          contact.status,
                        )}`}
                      >
                        {contact.status}
                      </span>
                    </Link>

                    <div className="mt-4 space-y-2 text-sm text-slate-400">
                      <p className="flex items-center gap-2">
                        <Building2
                          aria-hidden="true"
                          className="size-4 text-slate-600"
                        />
                        {contact.company || 'No company'}
                      </p>

                      <p className="flex items-center gap-2">
                        <Mail
                          aria-hidden="true"
                          className="size-4 text-slate-600"
                        />
                        <span className="truncate">
                          {contact.email || 'No email'}
                        </span>
                      </p>

                      <p className="flex items-center gap-2">
                        <Phone
                          aria-hidden="true"
                          className="size-4 text-slate-600"
                        />
                        {phoneNumber || 'No phone number'}
                      </p>

                      <div className="pt-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Tags
                        </p>
                        {contactTags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {visibleTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex max-w-40 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200"
                                title={tag.name}
                              >
                                <span
                                  aria-hidden="true"
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: tag.color || '#64748b' }}
                                />
                                <span className="truncate">{tag.name}</span>
                              </span>
                            ))}
                            {hiddenTagCount > 0 ? (
                              <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-400">
                                +{hiddenTagCount}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-slate-600">—</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {phoneNumber ? (
                        <Link
                          href={`/dashboard/dialer?contactId=${encodeURIComponent(
                            contact.id,
                          )}`}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                        >
                          <Phone
                            aria-hidden="true"
                            className="size-4"
                          />
                          Call
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 text-sm font-semibold text-slate-600">
                          <Phone
                            aria-hidden="true"
                            className="size-4"
                          />
                          Call
                        </span>
                      )}

                      <Link
                        href={`/dashboard/contacts/${contact.id}`}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        View details
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>

            <footer className="flex flex-col gap-4 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing {firstContactNumber}–
                {lastContactNumber} of {count}
              </p>

              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={previousUrl}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <ChevronLeft
                      aria-hidden="true"
                      className="size-4"
                    />
                    Previous
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 text-sm font-medium text-slate-600">
                    <ChevronLeft
                      aria-hidden="true"
                      className="size-4"
                    />
                    Previous
                  </span>
                )}

                <span className="px-2 text-sm text-slate-400">
                  Page {currentPage} of {totalPages}
                </span>

                {currentPage < totalPages ? (
                  <Link
                    href={nextUrl}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    Next
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 text-sm font-medium text-slate-600">
                    Next
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </span>
                )}
              </div>
            </footer>
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-500">
              <UserRound
                aria-hidden="true"
                className="size-6"
              />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-white">
              {search
                ? 'No matching contacts'
                : 'No contacts yet'}
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {search
                ? 'Try another name, email address, phone number, or company.'
                : 'Create your first contact to begin building your CRM database.'}
            </p>

            {search ? (
              <Link
                href="/dashboard/contacts"
                className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Clear search
              </Link>
            ) : (
              <Link
                href="/dashboard/contacts/new"
                className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                <Plus
                  aria-hidden="true"
                  className="size-4"
                />
                Add first contact
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  )
}