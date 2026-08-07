import Link from 'next/link'

import { requirePermission } from '@/lib/auth'
import { createCall } from '@/app/dashboard/calls/actions'
import CallForm from '@/components/calls/CallForm'
import { getAssignableMembers } from '@/lib/ownership'
import { getCurrentOrganization } from '@/lib/team'
import {
  getCallCampaigns,
  getCallContacts,
} from '@/lib/calls'

export default async function NewCallPage() {
  await requirePermission('calls.create')
  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('Unable to determine the current organization.')
  const [contacts, campaigns, owners] = await Promise.all([
    getCallContacts(),
    getCallCampaigns(),
    getAssignableMembers(membership),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-400">
            New call
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Create a call record
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Record a scheduled, completed, failed, or cancelled call and
            optionally associate it with a contact and campaign.
          </p>
        </div>

        <Link
          href="/dashboard/calls"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
        >
          Back to calls
        </Link>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
        <div className="mb-6 border-b border-white/10 pb-5">
          <h2 className="text-xl font-semibold text-white">
            Call information
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Enter the call details below. You can update them later.
          </p>
        </div>

        <CallForm
          contacts={contacts}
          campaigns={campaigns}
          owners={owners}
          action={createCall}
          submitLabel="Create call"
        />
      </section>
    </div>
  )
}