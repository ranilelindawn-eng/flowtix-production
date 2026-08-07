import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  CreditCard,
  History,
  Users,
} from 'lucide-react'

import OrganizationLifecycleControls from '@/components/platform/OrganizationLifecycleControls'
import {
  getPlatformOrganization,
  getPlatformOrganizationLifecycle,
} from '@/lib/platform/organizations'

function formatDate(value: string | null): string {
  if (!value) return '—'
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
  if (status === 'suspended') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

export default async function PlatformOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params

  const [organization, lifecycle] = await Promise.all([
    getPlatformOrganization(organizationId),
    getPlatformOrganizationLifecycle(organizationId),
  ])

  if (!organization) notFound()

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/organizations"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to organizations
        </Link>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                {organization.name}
              </h1>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(organization.status)}`}
              >
                {organization.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {organization.slug ?? organization.id}
            </p>
          </div>

          <Link
            href={`/platform/customers/${organization.id}`}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-4 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Open customer 360
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Users className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Active members</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {organization.memberCount}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <CreditCard className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Subscription</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {organization.subscription?.planName ?? 'None'}
          </p>
          <p className="mt-1 text-xs capitalize text-slate-500">
            {organization.subscription?.status?.replaceAll('_', ' ') ?? 'unconfigured'}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <CalendarClock className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Created</p>
          <p className="mt-1 text-sm font-medium text-white">
            {formatDate(organization.createdAt)}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <History className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Lifecycle events</p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {lifecycle.length}
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <OrganizationLifecycleControls
          organizationId={organization.id}
          organizationName={organization.name}
          status={organization.status}
        />

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Current organization state</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Owner</dt>
              <dd className="mt-1 text-slate-200">
                {organization.owner?.fullName ?? 'Unnamed owner'}
              </dd>
              <dd className="text-xs text-slate-500">
                {organization.owner?.email ?? 'No owner email'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Timezone</dt>
              <dd className="mt-1 text-slate-200">{organization.timezone}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last updated</dt>
              <dd className="mt-1 text-slate-200">
                {formatDate(organization.updatedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Billing provider</dt>
              <dd className="mt-1 capitalize text-slate-200">
                {organization.subscription?.billingProvider ?? '—'}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Platform lifecycle history</h2>
          <p className="mt-1 text-sm text-slate-500">
            Staff actor, reason, previous state, and resulting state for privileged organization actions.
          </p>
        </div>

        {lifecycle.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-500">
            No platform lifecycle actions have been recorded for this organization.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Event</th>
                  <th className="px-6 py-4 font-medium">Transition</th>
                  <th className="px-6 py-4 font-medium">Actor</th>
                  <th className="px-6 py-4 font-medium">Reason</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {lifecycle.map((event) => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 capitalize text-slate-200">
                      {event.eventType.replaceAll('_', ' ')}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {event.previousStatus ?? '—'} → {event.resultingStatus ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <p className="capitalize text-slate-300">
                        {event.actorRole?.replaceAll('_', ' ') ?? 'Platform staff'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.actorEmail ?? event.actorUserId ?? 'Unknown'}
                      </p>
                    </td>
                    <td className="max-w-md px-6 py-4 text-slate-400">
                      {event.reason ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                      {formatDate(event.createdAt)}
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
