import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Bot,
  Building2,
  CalendarDays,
  Mail,
  MessageSquareText,
  PhoneCall,
  Users,
} from 'lucide-react'

import { requirePlatformPermission } from '@/lib/platform/auth'
import { getPlatformCustomer } from '@/lib/platform/customers'

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
  if (status === 'suspended' || status === 'past_due') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
  }
  return 'border-slate-600 bg-slate-800 text-slate-300'
}

export default async function PlatformCustomerDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  await requirePlatformPermission('platform.customers.view')
  const { organizationId } = await params
  const customer = await getPlatformCustomer(organizationId)

  if (!customer) notFound()

  const usageCards = [
    { label: 'AI requests', value: customer.usage.aiRequests, icon: Bot },
    { label: 'Emails', value: customer.usage.emails, icon: Mail },
    { label: 'SMS', value: customer.usage.sms, icon: MessageSquareText },
  ]

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/customers"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>

        <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                {customer.name}
              </h1>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(customer.status)}`}
              >
                {customer.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {customer.slug ?? customer.id}
            </p>
          </div>

          <div className="rounded-xl border border-blue-400/15 bg-blue-400/[0.04] px-4 py-3 text-sm text-slate-400">
            Read-only Customer Management view. Organization lifecycle controls are added in the Organization Management phase.
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Users className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Active members</p>
          <p className="mt-1 text-2xl font-semibold text-white">{customer.memberCount}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Building2 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Contacts</p>
          <p className="mt-1 text-2xl font-semibold text-white">{customer.counts.contacts.toLocaleString()}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <PhoneCall className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Calls</p>
          <p className="mt-1 text-2xl font-semibold text-white">{customer.counts.calls.toLocaleString()}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <CalendarDays className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Campaigns</p>
          <p className="mt-1 text-2xl font-semibold text-white">{customer.counts.campaigns.toLocaleString()}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Organization</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Owner</dt>
              <dd className="mt-1 text-slate-200">{customer.owner?.fullName ?? 'Unnamed owner'}</dd>
              <dd className="text-xs text-slate-500">{customer.owner?.email ?? 'No email'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Timezone</dt>
              <dd className="mt-1 text-slate-200">{customer.timezone}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="mt-1 text-slate-200">{formatDate(customer.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last updated</dt>
              <dd className="mt-1 text-slate-200">{formatDate(customer.updatedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Subscription</h2>
          {customer.subscription ? (
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Plan</dt>
                <dd className="mt-1 text-slate-200">{customer.subscription.planName ?? customer.subscription.planCode ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Subscription status</dt>
                <dd className="mt-1">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(customer.subscription.status)}`}>
                    {customer.subscription.status.replaceAll('_', ' ')}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Billing provider</dt>
                <dd className="mt-1 capitalize text-slate-200">{customer.subscription.billingProvider ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last payment</dt>
                <dd className="mt-1 capitalize text-slate-200">{customer.subscription.lastPaymentStatus?.replaceAll('_', ' ') ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Current period ends</dt>
                <dd className="mt-1 text-slate-200">{formatDate(customer.subscription.currentPeriodEnd)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cancel at period end</dt>
                <dd className="mt-1 text-slate-200">{customer.subscription.cancelAtPeriodEnd ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-5 text-sm text-slate-500">No subscription record is attached to this organization.</p>
          )}
        </article>
      </section>

      <section>
        <h2 className="font-semibold text-white">Current-month metered usage</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {usageCards.map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <Icon className="h-5 w-5 text-blue-300" />
              <p className="mt-4 text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="font-semibold text-white">Workspace members</h2>
          <p className="mt-1 text-sm text-slate-500">Customer organization membership and role visibility for support operations.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/[0.025] text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Member</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {customer.members.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-200">{member.fullName ?? 'Unnamed member'}</p>
                    <p className="mt-1 text-xs text-slate-500">{member.email ?? member.userId}</p>
                  </td>
                  <td className="px-6 py-4 capitalize text-slate-300">{member.role}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(member.status)}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{formatDate(member.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
