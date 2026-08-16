import Link from 'next/link'
import {
  ArrowRight,
  Mail,
  MessageSquareText,
} from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganizationTimezone } from '@/lib/team'
import CommunicationComposer from './CommunicationComposer'

type CommunicationMessage = {
  id: string
  channel: string
  recipient: string
  subject: string | null
  body: string
  provider: string | null
  status: string
  sent_at: string | null
  created_at: string
  error_message: string | null
}

export default async function CommunicationsPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  const membership = await requirePermission('campaigns.view')
  const supabase = await createClient()

  const [messageResult, templateResult, snippetResult] = await Promise.all([
    supabase
      .from('communication_messages')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('message_templates')
      .select('id,name,channel,subject,body')
      .eq('organization_id', membership.organization_id)
      .order('name'),
    supabase
      .from('snippets')
      .select('id,name,shortcut,content')
      .eq('organization_id', membership.organization_id)
      .order('name'),
  ])

  if (messageResult.error) {
    throw new Error(
      `Failed to load communication history: ${messageResult.error.message}`,
    )
  }

  if (templateResult.error) {
    throw new Error(
      `Failed to load message templates: ${templateResult.error.message}`,
    )
  }

  if (snippetResult.error) {
    throw new Error(
      `Failed to load snippets: ${snippetResult.error.message}`,
    )
  }

  const messages = (messageResult.data ?? []) as CommunicationMessage[]
  const templates = (templateResult.data ?? []).map((template) => ({
    ...template,
    channel: template.channel as 'email' | 'sms',
  }))

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

  function deliveryTime(message: CommunicationMessage) {
    if (message.sent_at) {
      return new Date(message.sent_at).toLocaleString('en-US', { timeZone })
    }

    if (
      message.status === 'queued' ||
      message.status === 'scheduled' ||
      message.status === 'retrying'
    ) {
      return 'Not sent yet'
    }

    if (message.status === 'processing') {
      return 'Processing...'
    }

    return '—'
  }

  return (
    <div className="space-y-6 xl:-mx-6 2xl:-mx-16">
      <header>
        <p className="text-sm text-cyan-300">Omnichannel inbox</p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          Email &amp; SMS
        </h1>

        <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-400">
          Send email through the organization&apos;s connected Gmail account
          when available, with Resend as the platform fallback. SMS uses the
          configured telephony provider. Every attempt is logged.
        </p>
      </header>

      <CommunicationComposer
        templates={templates}
        snippets={snippetResult.data ?? []}
      />

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Message history</h2>
            <p className="mt-1 text-sm text-slate-500">
              Open any record to review the complete message and delivery
              details.
            </p>
          </div>

          <span className="text-sm text-slate-500">
            {messages.length} recent {messages.length === 1 ? 'message' : 'messages'}
          </span>
        </div>

        {messages.length > 0 ? (
          <div className="mt-5 space-y-3">
            <div className="hidden grid-cols-[120px_minmax(190px,1fr)_minmax(260px,2fr)_140px_150px_190px_28px] gap-4 px-4 text-xs font-medium uppercase tracking-[0.14em] text-slate-500 xl:grid">
              <span>Channel</span>
              <span>Recipient</span>
              <span>Subject / message</span>
              <span>Provider</span>
              <span>Status</span>
              <span>Delivery</span>
              <span aria-hidden="true" />
            </div>

            {messages.map((message) => (
              <Link
                key={message.id}
                href={`/dashboard/communications/${message.id}`}
                className="group grid gap-3 rounded-2xl border border-white/10 bg-[#07111F]/80 p-4 transition hover:border-blue-400/30 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 xl:grid-cols-[120px_minmax(190px,1fr)_minmax(260px,2fr)_140px_150px_190px_28px] xl:items-center xl:gap-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold uppercase text-cyan-300">
                  {message.channel === 'email' ? (
                    <Mail className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{message.channel}</span>
                </div>

                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-600 xl:hidden">
                    Recipient
                  </p>
                  <p className="mt-1 truncate text-sm text-slate-200 xl:mt-0">
                    {message.recipient}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-600 xl:hidden">
                    Subject / message
                  </p>
                  <p className="mt-1 truncate text-sm text-slate-300 xl:mt-0">
                    {message.subject || message.body.slice(0, 110)}
                  </p>
                  {message.subject ? (
                    <p className="mt-1 truncate text-xs text-slate-600">
                      {message.body}
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-600 xl:hidden">
                    Provider
                  </p>
                  <p className="mt-1 text-sm text-slate-400 xl:mt-0">
                    {message.provider ?? '—'}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-600 xl:hidden">
                    Status
                  </p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium xl:mt-0 ${statusStyle(
                      message.status,
                    )}`}
                  >
                    {message.status}
                  </span>
                  {message.error_message ? (
                    <p className="mt-2 line-clamp-2 text-xs text-red-300">
                      {message.error_message}
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-600 xl:hidden">
                    Delivery
                  </p>
                  <p className="mt-1 text-sm text-slate-500 xl:mt-0">
                    {deliveryTime(message)}
                  </p>
                </div>

                <ArrowRight
                  className="hidden h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-blue-300 xl:block"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-slate-500">
            No email or SMS messages have been sent from this workspace.
          </div>
        )}
      </section>
    </div>
  )
}
