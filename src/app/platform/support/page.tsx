import Link from 'next/link'
import {
  Clock3,
  Headphones,
  History,
  ShieldCheck,
} from 'lucide-react'

import PlatformSupportSessionForm from '@/components/platform/PlatformSupportSessionForm'
import { getPlatformCustomers } from '@/lib/platform/customers'
import { getPlatformSupportSessions } from '@/lib/platform/support'
import { getPlatformSupportPolicy } from '@/lib/platform/settings'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function statusClass(status: string): string {
  if (status === 'active') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  }
  if (status === 'expired') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

export default async function PlatformSupportPage() {
  const [customerDirectory, sessions, supportPolicy] = await Promise.all([
    getPlatformCustomers({ limit: 100, offset: 0 }),
    getPlatformSupportSessions(),
    getPlatformSupportPolicy(),
  ])

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Platform operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Support Workspace Access
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Temporary, organization-scoped support access for troubleshooting
            customer workspaces without adding Flowtix staff to the customer team.
          </p>
        </div>

        <Link
          href="/platform/support/validation"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/15"
        >
          Run security validation
        </Link>
      </section>

      <section className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <h2 className="font-semibold text-blue-100">
              Read-only impersonation foundation
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Sessions expire after {supportPolicy.sessionMinutes} minutes, require a reason, are bound to
              the initiating platform user, and expose only support-safe workspace
              data through dedicated staff-only RPCs.
            </p>
          </div>
        </div>
      </section>

      <PlatformSupportSessionForm
        sessionMinutes={supportPolicy.sessionMinutes}
        referenceRequired={supportPolicy.referenceRequired}
        organizations={customerDirectory.items.map((customer) => ({
          id: customer.id,
          name: customer.name,
          status: customer.status,
        }))}
      />

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-slate-400" />
            <div>
              <h2 className="font-semibold text-white">Recent support sessions</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sessions created by the currently signed-in Flowtix staff member.
              </p>
            </div>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Headphones className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">
              No support sessions have been created yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Organization</th>
                  <th className="px-6 py-4 font-medium">Reference</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Started</th>
                  <th className="px-6 py-4 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-6 py-5">
                      {session.status === 'active' ? (
                        <Link
                          href={`/platform/support/${session.id}`}
                          className="font-semibold text-white hover:text-blue-300"
                        >
                          {session.organizationName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-300">
                          {session.organizationName}
                        </span>
                      )}
                      <p className="mt-1 max-w-sm truncate text-xs text-slate-500">
                        {session.reason}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-slate-400">
                      {session.reference ?? '—'}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(session.status)}`}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-slate-400">
                      {formatDate(session.startedAt)}
                    </td>
                    <td className="px-6 py-5">
                      <p className="flex items-center gap-2 text-slate-400">
                        <Clock3 className="h-4 w-4 text-slate-600" />
                        {formatDate(session.expiresAt)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
