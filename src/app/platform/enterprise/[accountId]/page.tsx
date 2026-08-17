import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CreditCard,
  Gem,
  MessageSquareText,
  Users,
} from 'lucide-react'

import PlatformEnterpriseControls from '@/components/platform/PlatformEnterpriseControls'
import { getPlatformEnterpriseAccount } from '@/lib/platform/enterprise'

function date(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(parsed)
}

function money(value: number | null): string {
  return value === null
    ? 'Not proposed'
    : `₱${(value / 100).toLocaleString('en-PH')}/month`
}

export default async function PlatformEnterpriseDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const account = await getPlatformEnterpriseAccount(accountId)

  if (!account) notFound()

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/platform/enterprise"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Enterprise Accounts
        </Link>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-300">
              Enterprise assisted onboarding
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              {account.companyName ?? account.contactName}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {account.contactName} · {account.contactEmail}
            </p>
            <p className="mt-1 text-xs text-slate-600">{account.id}</p>
          </div>

          {account.organizationId ? (
            <Link
              href={`/platform/customers/${account.organizationId}`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/5"
            >
              Open customer 360
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Gem className="h-5 w-5 text-violet-300" />
          <p className="mt-4 text-sm text-slate-500">Onboarding</p>
          <p className="mt-1 text-xl font-semibold capitalize text-white">
            {account.onboardingStatus.replaceAll('_', ' ')}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <CreditCard className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Proposed price</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {money(account.proposedMonthlyPriceCents)}
          </p>
          <p className="mt-1 text-xs capitalize text-slate-500">
            Payment: {account.paymentStatus.replaceAll('_', ' ')}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Building2 className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Linked organization</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {account.organizationName ?? 'Not linked yet'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {account.currentPlanCode
              ? `Current plan: ${account.currentPlanCode}`
              : 'Link the customer workspace before activation.'}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Users className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-sm text-slate-500">Custom user limit</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {account.customMemberLimit ?? 'Not set'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Enterprise activation requires 25+ users.
          </p>
        </article>
      </section>

      {account.inquiryMessage ? (
        <section className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-5">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-violet-300" />
            <div>
              <h2 className="font-semibold text-white">Enterprise inquiry</h2>
              <p className="mt-1 text-xs text-slate-500">
                Submitted {date(account.inquiryCreatedAt)} through the public Enterprise contact form.
              </p>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">
            {account.inquiryMessage}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">
            Paid at
          </p>
          <p className="mt-2 text-sm text-slate-300">{date(account.paidAt)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">
            Activated
          </p>
          <p className="mt-2 text-sm text-slate-300">{date(account.activatedAt)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">
            Current period ends
          </p>
          <p className="mt-2 text-sm text-slate-300">{date(account.currentPeriodEnd)}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">
            Last updated
          </p>
          <p className="mt-2 text-sm text-slate-300">{date(account.updatedAt)}</p>
        </article>
      </section>

      <PlatformEnterpriseControls account={account} />
    </div>
  )
}
