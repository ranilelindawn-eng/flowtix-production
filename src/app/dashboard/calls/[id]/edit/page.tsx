import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updateCall } from '@/app/dashboard/calls/actions'
import CallForm from '@/components/calls/CallForm'
import { getAssignableMembers } from '@/lib/ownership'
import { getCurrentOrganization } from '@/lib/team'
import {
  getCall,
  getCallCampaigns,
  getCallContacts,
} from '@/lib/calls'

type EditCallPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditCallPage({
  params,
}: EditCallPageProps) {
  const { id } = await params

  const membership = await getCurrentOrganization()
  if (!membership) throw new Error('Unable to determine the current organization.')
  const [call, contacts, campaigns, owners] = await Promise.all([
    getCall(id),
    getCallContacts(),
    getCallCampaigns(),
    getAssignableMembers(membership),
  ])

  if (!call) {
    notFound()
  }

  const callTitle =
    call.direction === 'inbound' ? 'Inbound call' : 'Outbound call'

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-400">
            Edit call
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Update {callTitle}
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Update the call status, schedule, duration, recording availability,
            associations, and notes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/calls"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
          >
            Back to calls
          </Link>

          <Link
            href={`/dashboard/calls/${id}`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            View call
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/10">
        <div className="mb-6 border-b border-white/10 pb-5">
          <h2 className="text-xl font-semibold text-white">
            Call information
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Modify the details below and save your changes.
          </p>
        </div>

        <CallForm
          contacts={contacts}
          campaigns={campaigns}
          owners={owners}
          initialValues={call}
          hiddenId={id}
          action={updateCall}
          submitLabel="Save changes"
        />
      </section>
    </div>
  )
}