import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'

import CampaignMemberStatusBadge from '@/components/campaign-members/CampaignMemberStatusBadge'
import type {
  CampaignMember,
} from '@/lib/campaign-members'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type CampaignMembersTableProps = {
  members: CampaignMember[]
}

function formatDateTime(value: string | null, timeZone: string): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getContactName(member: CampaignMember): string {
  const firstName = member.contact?.first_name ?? ''
  const lastName = member.contact?.last_name ?? ''
  const fullName = `${firstName} ${lastName}`.trim()

  return fullName || 'Unknown contact'
}

function getPriorityLabel(priority: number): string {
  if (priority >= 100) {
    return 'Highest'
  }

  if (priority >= 50) {
    return 'High'
  }

  if (priority >= 10) {
    return 'Medium'
  }

  return 'Normal'
}

function getPriorityClasses(priority: number): string {
  if (priority >= 100) {
    return 'border-red-500/20 bg-red-500/10 text-red-400'
  }

  if (priority >= 50) {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-400'
  }

  if (priority >= 10) {
    return 'border-blue-500/20 bg-blue-500/10 text-blue-400'
  }

  return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
}

export default async function CampaignMembersTable({
  members,
}: CampaignMembersTableProps) {
  const timeZone = await getCurrentOrganizationTimezone()
  if (members.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0B1726]/90 px-6 py-16 text-center shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-xl font-semibold text-blue-400">
          +
        </div>

        <h2 className="mt-4 text-lg font-semibold text-white">
          No campaign members found
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Add contacts to this campaign or change your search and filter
          settings to view matching campaign members.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1180px] table-auto text-left text-sm">
          <thead className="border-b border-white/10 bg-[#07111F]/80 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-semibold">
                Contact
              </th>

              <th className="px-6 py-4 font-semibold">
                Company
              </th>

              <th className="px-6 py-4 font-semibold">
                Phone
              </th>

              <th className="px-6 py-4 font-semibold">
                Status
              </th>

              <th className="px-6 py-4 font-semibold">
                Priority
              </th>

              <th className="px-6 py-4 font-semibold">
                Retries
              </th>

              <th className="px-6 py-4 font-semibold">
                Last called
              </th>

              <th className="px-6 py-4 font-semibold">
                Disposition
              </th>

              <th className="px-6 py-4 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5 text-slate-300">
            {members.map((member) => {
              const contactName = getContactName(member)

              return (
                <tr
                  key={member.id}
                  className="transition hover:bg-white/[0.03]"
                >
                  <td className="px-6 py-4">
                    {member.contact ? (
                      <Link
                        href={`/dashboard/contacts/${member.contact.id}`}
                        className="font-medium text-white transition hover:text-cyan-300"
                      >
                        {contactName}
                      </Link>
                    ) : (
                      <span className="font-medium text-white">
                        {contactName}
                      </span>
                    )}

                    <p className="mt-1 max-w-64 truncate text-xs text-slate-500">
                      {member.contact?.email || 'No email'}
                    </p>
                  </td>

                  <td className="max-w-48 truncate px-6 py-4">
                    {member.contact?.company ?? '—'}
                  </td>

                  <td className="px-6 py-4">
                    {member.contact?.phone ?? '—'}
                  </td>

                  <td className="px-6 py-4">
                    <CampaignMemberStatusBadge
                      status={member.status}
                    />
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getPriorityClasses(
                          member.priority,
                        )}`}
                      >
                        {getPriorityLabel(member.priority)}
                      </span>

                      <span className="text-xs text-slate-500">
                        {member.priority}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-slate-300">
                      {member.retry_count}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4 text-slate-400">
                    {formatDateTime(member.last_called_at, timeZone)}
                  </td>

                  <td className="max-w-52 truncate px-6 py-4 text-slate-400">
                    {member.last_disposition ?? '—'}
                  </td>

                  <td className="px-6 py-4 text-right">
                    {member.contact ? (
                      <Link
                        href={`/dashboard/contacts/${member.contact.id}`}
                        aria-label={`View ${contactName}`}
                        title={`View ${contactName}`}
                        className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <MoreHorizontal
                          aria-hidden="true"
                          className="size-4"
                        />
                      </Link>
                    ) : (
                      <span className="inline-flex size-10 items-center justify-center rounded-full border border-white/5 bg-white/[0.02] text-slate-600">
                        <MoreHorizontal
                          aria-hidden="true"
                          className="size-4"
                        />
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-white/10 md:hidden">
        {members.map((member) => {
          const contactName = getContactName(member)

          return (
            <article
              key={member.id}
              className="p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {member.contact ? (
                    <Link
                      href={`/dashboard/contacts/${member.contact.id}`}
                      className="block truncate font-semibold text-white transition hover:text-cyan-300"
                    >
                      {contactName}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold text-white">
                      {contactName}
                    </p>
                  )}

                  <p className="mt-1 truncate text-sm text-slate-400">
                    {member.contact?.email || 'No email'}
                  </p>
                </div>

                <CampaignMemberStatusBadge
                  status={member.status}
                  className="shrink-0"
                />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">
                    Company
                  </dt>

                  <dd className="mt-1 truncate text-slate-200">
                    {member.contact?.company ?? '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Phone
                  </dt>

                  <dd className="mt-1 truncate text-slate-200">
                    {member.contact?.phone ?? '—'}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Priority
                  </dt>

                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getPriorityClasses(
                        member.priority,
                      )}`}
                    >
                      {getPriorityLabel(member.priority)} ·{' '}
                      {member.priority}
                    </span>
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Retries
                  </dt>

                  <dd className="mt-1 text-slate-200">
                    {member.retry_count}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Last called
                  </dt>

                  <dd className="mt-1 text-slate-200">
                    {formatDateTime(member.last_called_at, timeZone)}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Disposition
                  </dt>

                  <dd className="mt-1 truncate text-slate-200">
                    {member.last_disposition ?? '—'}
                  </dd>
                </div>
              </dl>

              {member.notes ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notes
                  </p>

                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">
                    {member.notes}
                  </p>
                </div>
              ) : null}

              {member.contact ? (
                <div className="mt-5">
                  <Link
                    href={`/dashboard/contacts/${member.contact.id}`}
                    className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
                  >
                    View contact
                  </Link>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}