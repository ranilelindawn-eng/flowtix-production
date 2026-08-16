import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Mail,
  MessageSquareText,
  UserRound,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganizationTimezone } from '@/lib/team'

type CommunicationMessage = {
  id: string
  organization_id: string
  contact_id: string | null
  company_id: string | null
  campaign_id: string | null
  channel: string
  direction: string
  recipient: string
  sender: string | null
  subject: string | null
  body: string
  provider: string | null
  provider_message_id: string | null
  provider_status: string | null
  status: string
  error_message: string | null
  provider_error_code: string | null
  provider_error_message: string | null
  source: string | null
  attempt_count: number | null
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  created_at: string
  updated_at: string | null
}

type DeliveryEvent = {
  id: string
  provider: string
  provider_status: string | null
  normalized_status: string
  event_at: string
  error_code: string | null
  error_message: string | null
}

function statusStyle(status: string) {
  switch (status) {
    case 'sent':
    case 'delivered':
      return 'bg-emerald-500/10 text-emerald-300'
    case 'processing':
      return 'bg-blue-500/10 text-blue-300'
    case 'queued':
    case 'scheduled':
    case 'retrying':
      return 'bg-yellow-500/10 text-yellow-300'
    case 'failed':
    case 'cancelled':
      return 'bg-red-500/10 text-red-300'
    default:
      return 'bg-slate-500/10 text-slate-300'
  }
}

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', { timeZone })
}

export default async function CommunicationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const timeZone = await getCurrentOrganizationTimezone()
  const membership = await requirePermission('campaigns.view')
  const supabase = await createClient()

  const { data: messageData, error: messageError } = await supabase
    .from('communication_messages')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (messageError) {
    throw new Error(`Failed to load communication: ${messageError.message}`)
  }

  if (!messageData) notFound()

  const message = messageData as CommunicationMessage

  const [contactResult, companyResult, campaignResult, eventResult] =
    await Promise.all([
      message.contact_id
        ? supabase
            .from('contacts')
            .select('id,first_name,last_name,email,phone')
            .eq('id', message.contact_id)
            .eq('organization_id', membership.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      message.company_id
        ? supabase
            .from('companies')
            .select('id,name')
            .eq('id', message.company_id)
            .eq('organization_id', membership.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      message.campaign_id
        ? supabase
            .from('campaigns')
            .select('id,name')
            .eq('id', message.campaign_id)
            .eq('organization_id', membership.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('communication_delivery_events')
        .select(
          'id,provider,provider_status,normalized_status,event_at,error_code,error_message',
        )
        .eq('communication_message_id', message.id)
        .eq('organization_id', membership.organization_id)
        .order('event_at', { ascending: false })
        .limit(50),
    ])

  if (contactResult.error) {
    throw new Error(`Failed to load related contact: ${contactResult.error.message}`)
  }
  if (companyResult.error) {
    throw new Error(`Failed to load related company: ${companyResult.error.message}`)
  }
  if (campaignResult.error) {
    throw new Error(`Failed to load related campaign: ${campaignResult.error.message}`)
  }
  if (eventResult.error) {
    throw new Error(`Failed to load delivery history: ${eventResult.error.message}`)
  }

  const deliveryEvents = (eventResult.data ?? []) as DeliveryEvent[]
  const contact = contactResult.data
  const company = companyResult.data
  const campaign = campaignResult.data
  const contactName = contact
    ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() ||
      contact.email ||
      contact.phone ||
      'Contact'
    : null

  return (
    <div className="space-y-6 xl:-mx-6 2xl:-mx-16">
      <Link
        href="/dashboard/communications"
        className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Email &amp; SMS
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-cyan-300">Communication details</p>
          <h1 className="mt-2 break-words text-3xl font-semibold text-white">
            {message.subject || `${message.channel.toUpperCase()} message`}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {message.channel.toUpperCase()} · {message.direction} ·{' '}
            {formatDateTime(message.created_at, timeZone)}
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${statusStyle(
            message.status,
          )}`}
        >
          {message.status}
        </span>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-white">
            {message.channel === 'email' ? (
              <Mail className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            ) : (
              <MessageSquareText
                className="h-5 w-5 text-cyan-300"
                aria-hidden="true"
              />
            )}
            <h2 className="text-lg font-semibold">Message</h2>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Recipient
              </dt>
              <dd className="mt-1 break-all text-sm text-slate-200">
                {message.recipient}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Sender
              </dt>
              <dd className="mt-1 break-all text-sm text-slate-200">
                {message.sender || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Subject
              </dt>
              <dd className="mt-1 text-sm text-slate-200">
                {message.subject || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Source
              </dt>
              <dd className="mt-1 text-sm capitalize text-slate-200">
                {message.source || '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#07111F] p-5">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">
              {message.body}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Delivery</h2>

          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <dt className="text-slate-500">Provider</dt>
              <dd className="text-right text-slate-200">
                {message.provider || '—'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <dt className="text-slate-500">Provider status</dt>
              <dd className="text-right text-slate-200">
                {message.provider_status || '—'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <dt className="text-slate-500">Attempts</dt>
              <dd className="text-right text-slate-200">
                {message.attempt_count ?? 0}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <dt className="text-slate-500">Sent</dt>
              <dd className="text-right text-slate-200">
                {formatDateTime(message.sent_at, timeZone)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <dt className="text-slate-500">Delivered</dt>
              <dd className="text-right text-slate-200">
                {formatDateTime(message.delivered_at, timeZone)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Last update</dt>
              <dd className="text-right text-slate-200">
                {formatDateTime(message.updated_at, timeZone)}
              </dd>
            </div>
          </dl>

          {message.error_message || message.provider_error_message ? (
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">
              <p className="font-medium">Delivery error</p>
              <p className="mt-1 leading-6">
                {message.provider_error_message || message.error_message}
              </p>
              {message.provider_error_code ? (
                <p className="mt-2 text-xs text-red-300/70">
                  Code: {message.provider_error_code}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {contact || company || campaign ? (
        <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Related CRM records</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {contact ? (
              <Link
                href={`/dashboard/contacts/${contact.id}`}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#07111F] p-4 transition hover:border-blue-400/30 hover:bg-white/[0.035]"
              >
                <UserRound className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
                    Contact
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-white">
                    {contactName}
                  </p>
                </div>
              </Link>
            ) : null}

            {company ? (
              <Link
                href={`/dashboard/companies/${company.id}`}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#07111F] p-4 transition hover:border-blue-400/30 hover:bg-white/[0.035]"
              >
                <Building2 className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
                    Company
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-white">
                    {company.name}
                  </p>
                </div>
              </Link>
            ) : null}

            {campaign ? (
              <Link
                href={`/dashboard/campaigns/${campaign.id}`}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#07111F] p-4 transition hover:border-blue-400/30 hover:bg-white/[0.035]"
              >
                <CalendarDays className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
                    Campaign
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-white">
                    {campaign.name}
                  </p>
                </div>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Delivery event history</h2>
        <p className="mt-1 text-sm text-slate-500">
          Provider callbacks recorded for this message.
        </p>

        {deliveryEvents.length > 0 ? (
          <div className="mt-5 divide-y divide-white/10 rounded-xl border border-white/10 bg-[#07111F]">
            {deliveryEvents.map((event) => (
              <div
                key={event.id}
                className="grid gap-3 p-4 md:grid-cols-[150px_160px_minmax(0,1fr)_220px] md:items-center"
              >
                <span className="text-sm text-slate-300">{event.provider}</span>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(
                    event.normalized_status,
                  )}`}
                >
                  {event.normalized_status}
                </span>
                <div className="min-w-0 text-sm text-slate-500">
                  <p className="truncate">
                    Provider status: {event.provider_status || '—'}
                  </p>
                  {event.error_message ? (
                    <p className="mt-1 text-xs text-red-300">
                      {event.error_message}
                      {event.error_code ? ` (${event.error_code})` : ''}
                    </p>
                  ) : null}
                </div>
                <span className="text-sm text-slate-500 md:text-right">
                  {formatDateTime(event.event_at, timeZone)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-500">
            No provider delivery callbacks have been recorded for this message.
          </div>
        )}
      </section>
    </div>
  )
}
