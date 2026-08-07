import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Contact,
  Megaphone,
  PhoneCall,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { endPlatformSupportSession } from '@/app/platform/support/actions'
import { getPlatformSupportWorkspace } from '@/lib/platform/support'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function PlatformSupportWorkspacePage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const workspace = await getPlatformSupportWorkspace(sessionId)

  if (!workspace || workspace.session.status !== 'active') {
    notFound()
  }

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/support"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Support Access
        </Link>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                {workspace.organization.name}
              </h1>
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-200">
                Read-only support session
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Expires {formatDate(workspace.session.expiresAt)} · Access count{' '}
              {workspace.session.accessCount}
            </p>
          </div>

          <form action={endPlatformSupportSession} className="flex gap-2">
            <input type="hidden" name="sessionId" value={workspace.session.id} />
            <input
              type="hidden"
              name="outcome"
              value="Support session ended manually from the workspace view."
            />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-400/15"
            >
              End support session
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="text-sm leading-6 text-slate-400">
            You are viewing a staff-only support snapshot, not acting as a customer
            user. Editing, calling, messaging, billing changes, and customer mutations
            are intentionally unavailable in this phase.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Members', workspace.counts.members, Users],
          ['Contacts', workspace.counts.contacts, Contact],
          ['Campaigns', workspace.counts.campaigns, Megaphone],
          ['Calls', workspace.counts.calls, PhoneCall],
        ].map(([label, value, Icon]) => {
          const IconComponent = Icon as typeof Users
          return (
            <article
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <IconComponent className="h-5 w-5 text-blue-300" />
              <p className="mt-4 text-sm text-slate-500">{String(label)}</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {Number(value).toLocaleString()}
              </p>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Support context</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Organization</dt>
              <dd className="mt-1 text-slate-200">{workspace.organization.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Workspace status</dt>
              <dd className="mt-1 capitalize text-slate-200">
                {workspace.organization.status}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Plan</dt>
              <dd className="mt-1 text-slate-200">
                {workspace.subscription.planName ?? 'No subscription'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Subscription status</dt>
              <dd className="mt-1 capitalize text-slate-200">
                {workspace.subscription.status?.replaceAll('_', ' ') ?? '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Reason</dt>
              <dd className="mt-1 text-slate-200">{workspace.session.reason}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Reference</dt>
              <dd className="mt-1 text-slate-200">
                {workspace.session.reference ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Timezone</dt>
              <dd className="mt-1 text-slate-200">{workspace.organization.timezone}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last support access</dt>
              <dd className="mt-1 text-slate-200">
                {workspace.session.lastAccessedAt
                  ? formatDate(workspace.session.lastAccessedAt)
                  : 'First access'}
              </dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-blue-300" />
            <h2 className="font-semibold text-white">Team members</h2>
          </div>
          <div className="mt-5 space-y-3">
            {workspace.members.length === 0 ? (
              <p className="text-sm text-slate-500">No members found.</p>
            ) : (
              workspace.members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-xl border border-white/10 bg-[#050D18] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-200">
                        {member.fullName ?? 'Unnamed user'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {member.email ?? 'No email'}
                      </p>
                    </div>
                    <span className="text-xs capitalize text-slate-400">
                      {member.role} · {member.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold text-white">Recent contacts</h2>
          </div>
          <div className="divide-y divide-white/10">
            {workspace.recentContacts.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No contacts found.</p>
            ) : (
              workspace.recentContacts.map((contact) => (
                <div key={contact.id} className="px-5 py-4">
                  <p className="text-sm font-medium text-slate-200">{contact.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{contact.email}</p>
                  <p className="mt-1 text-xs capitalize text-slate-600">{contact.status}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold text-white">Recent calls</h2>
          </div>
          <div className="divide-y divide-white/10">
            {workspace.recentCalls.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No calls found.</p>
            ) : (
              workspace.recentCalls.map((call) => (
                <div key={call.id} className="px-5 py-4">
                  <p className="text-sm font-medium text-slate-200">
                    {call.contactName ?? 'Unknown contact'}
                  </p>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {call.direction} · {call.status}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDate(call.startedAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold text-white">Recent campaigns</h2>
          </div>
          <div className="divide-y divide-white/10">
            {workspace.recentCampaigns.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">No campaigns found.</p>
            ) : (
              workspace.recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="px-5 py-4">
                  <p className="text-sm font-medium text-slate-200">{campaign.name}</p>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {campaign.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {formatDate(campaign.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
