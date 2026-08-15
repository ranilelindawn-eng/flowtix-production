import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  PhoneCall,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import {
  getCurrentEntitlements,
  hasEntitlement,
} from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/server'

import DialerClient from './DialerClient'
import { getAssignedDialerContacts, getDialerContactById } from './actions'

type DialerPageProps = {
  searchParams?: Promise<{
    contactId?: string
    phone?: string
  }>
}

export type DialerPhoneNumber = {
  id: string
  phoneNumber: string
  friendlyName: string
  isDefault: boolean
  provider: 'signalwire'
}

function DialerLocked({
  planName,
  subscriptionStatus,
}: {
  planName: string
  subscriptionStatus: string
}) {
  const statusLabel = subscriptionStatus
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Cloud calling
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Dialer
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Place browser calls from Flowtix after Cloud Dialer is enabled for
          this organization.
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60">
        <div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/10 via-blue-400/5 to-transparent p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10">
                <LockKeyhole className="h-6 w-6 text-cyan-300" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Cloud Dialer is not enabled on the current plan
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Current plan: {planName} · Subscription: {statusLabel}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/billing?feature=dialer.cloud"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              <CreditCard className="h-4 w-4" />
              View eligible plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[
            'Browser-based outbound calling',
            'Workspace caller ID selection',
            'SignalWire call controls',
          ].map((feature) => (
            <div
              key={feature}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {feature}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 bg-white/[0.02] px-6 py-4">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <PhoneCall className="h-5 w-5 text-cyan-300" />
            Calling APIs, provider tokens, and usage consumption remain
            disabled until the entitlement is active.
          </div>
        </div>
      </section>
    </div>
  )
}

export default async function DialerPage({
  searchParams,
}: DialerPageProps) {
  const params = await searchParams
  const organization = await requirePermission('calls.create')
  const entitlements = await getCurrentEntitlements()

  if (
    !entitlements ||
    !hasEntitlement(entitlements, 'dialer.cloud')
  ) {
    return (
      <DialerLocked
        planName={entitlements?.planName ?? 'No active plan'}
        subscriptionStatus={
          entitlements?.subscriptionStatus ?? 'inactive'
        }
      />
    )
  }

  const contactId = params?.contactId?.trim() ?? ''
  const initialPhoneNumber = params?.phone?.trim() ?? ''

  const [initialContact, assignedContacts] = await Promise.all([
    contactId.length > 0
      ? getDialerContactById(contactId)
      : Promise.resolve(null),
    getAssignedDialerContacts(),
  ])

  const supabase = await createClient()
  const { data: phoneNumberRows, error: phoneNumberError } = await supabase
    .from('organization_phone_numbers')
    .select(
      'id,provider,phone_number,friendly_name,is_default,capabilities',
    )
    .eq('organization_id', organization.organization_id)
    .eq('provider', 'signalwire')
    .order('is_default', { ascending: false })
    .order('friendly_name', { ascending: true })

  if (phoneNumberError) {
    throw new Error(
      `Unable to load workspace phone numbers: ${phoneNumberError.message}`,
    )
  }

  const callerIds: DialerPhoneNumber[] = (phoneNumberRows ?? [])
    .filter((row) => {
      const capabilities =
        row.capabilities && typeof row.capabilities === 'object'
          ? (row.capabilities as Record<string, unknown>)
          : {}

      return capabilities.voice !== false
    })
    .map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      friendlyName: row.friendly_name,
      isDefault: row.is_default,
      provider: 'signalwire',
    }))

  return (
    <DialerClient
      initialContact={initialContact}
      initialPhoneNumber={initialPhoneNumber}
      callerIds={callerIds}
      assignedContacts={assignedContacts}
    />
  )
}
