import Link from 'next/link'
import {
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageSquareText,
  TriangleAlert,
} from 'lucide-react'

import type { PlatformSmsSenderRequestDirectory } from '@/lib/platform/sms-provisioning'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function numberTypeLabel(value: string): string {
  if (value === '10dlc') return 'Local VoIP / 10DLC'
  if (value === 'toll_free') return 'Toll-Free'
  return value
}

function statusLabel(value: string): string {
  switch (value) {
    case 'provider_submission_required':
      return 'Ready for provider submission'
    case 'provider_processing':
      return 'Provider processing'
    case 'action_required':
      return 'Action required'
    case 'active':
      return 'Active'
    case 'rejected':
      return 'Rejected'
    case 'cancelled':
      return 'Cancelled'
    case 'replaced':
      return 'Replaced'
    default:
      return value.replaceAll('_', ' ')
  }
}

function statusClass(value: string): string {
  switch (value) {
    case 'provider_submission_required':
      return 'border-blue-400/20 bg-blue-400/10 text-blue-200'
    case 'provider_processing':
      return 'border-violet-400/20 bg-violet-400/10 text-violet-200'
    case 'action_required':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
    case 'active':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    case 'rejected':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-200'
    default:
      return 'border-white/10 bg-white/[0.04] text-slate-300'
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'active') return <CheckCircle2 className="h-4 w-4" />
  if (status === 'action_required' || status === 'rejected') {
    return <TriangleAlert className="h-4 w-4" />
  }
  return <Clock3 className="h-4 w-4" />
}

export default function PlatformSmsProvisioningDirectory({
  directory,
  previousHref,
  nextHref,
}: {
  directory: PlatformSmsSenderRequestDirectory
  previousHref: string | null
  nextHref: string | null
}) {
  const pendingCount = directory.items.filter((request) =>
    ['provider_submission_required', 'provider_processing'].includes(request.status),
  ).length
  const actionRequiredCount = directory.items.filter(
    (request) => request.status === 'action_required',
  ).length

  return (
    <section
      id="sms-provisioning"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"
    >
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-300">
              <MessageSquareText className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                Hosted messaging
              </p>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Company SMS provisioning requests
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
              Requests submitted by workspace owners from Organization → Company SMS number appear
              here automatically. Open a request to review the carrier details and documents before
              submitting Messaging Services Only in SignalWire.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-slate-950 px-3 py-1.5 text-slate-300">
              {directory.total} total
            </span>
            {pendingCount > 0 ? (
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-blue-200">
                {pendingCount} pending on this page
              </span>
            ) : null}
            {actionRequiredCount > 0 ? (
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-amber-200">
                {actionRequiredCount} need action
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {directory.items.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <MessageSquareText className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-white">No provisioning requests yet</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            When a subscriber owner submits an existing-company-number request from their
            Organization page, it will appear in this section automatically. No SignalWire Port
            Request should be created until a real subscriber request is shown here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Organization</th>
                <th className="px-6 py-4 font-medium">Company number</th>
                <th className="px-6 py-4 font-medium">Number type</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Submitted</th>
                <th className="px-6 py-4 font-medium">Provider reference</th>
                <th className="px-6 py-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {directory.items.map((request) => (
                <tr key={request.id} className="transition hover:bg-white/[0.025]">
                  <td className="px-6 py-5">
                    <p className="font-semibold text-white">{request.organizationName}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Building2 className="h-3.5 w-3.5" />
                      {request.organizationStatus}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="font-medium text-slate-200">{request.phoneNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">{request.voiceProviderName}</p>
                  </td>
                  <td className="px-6 py-5 text-slate-300">
                    {numberTypeLabel(request.numberType)}
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(request.status)}`}
                    >
                      <StatusIcon status={request.status} />
                      {statusLabel(request.status)}
                    </span>
                    {request.providerStatus ? (
                      <p className="mt-2 text-xs text-slate-500">{request.providerStatus}</p>
                    ) : null}
                  </td>
                  <td className="px-6 py-5 text-slate-300">{formatDate(request.submittedAt)}</td>
                  <td className="px-6 py-5 text-slate-400">
                    {request.providerSubmissionReference ?? '—'}
                  </td>
                  <td className="px-6 py-5">
                    {request.integrationId ? (
                      <Link
                        href={`/platform/telephony/${request.integrationId}#sms-provisioning`}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-xs font-semibold text-blue-200 transition hover:bg-blue-400/15"
                      >
                        Review request
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/platform/organizations/${request.organizationId}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/15"
                      >
                        Telephony setup required
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {directory.total > directory.limit ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <p className="text-xs text-slate-500">
            Showing {directory.offset + 1}–
            {Math.min(directory.offset + directory.items.length, directory.total)} of{' '}
            {directory.total} requests
          </p>
          <div className="flex items-center gap-2">
            {previousHref ? (
              <Link
                href={previousHref}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5"
              >
                Previous
              </Link>
            ) : null}
            {nextHref ? (
              <Link
                href={nextHref}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
