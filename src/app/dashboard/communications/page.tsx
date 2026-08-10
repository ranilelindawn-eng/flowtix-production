import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import CommunicationComposer from './CommunicationComposer'

import { getCurrentOrganizationTimezone } from '@/lib/team'
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
    <div className="space-y-6">
      <header>
        <p className="text-sm text-cyan-300">
          Omnichannel inbox
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          Email &amp; SMS
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Send email through the organization&apos;s connected Gmail
          account when available, with Resend as the platform fallback.
          SMS uses the configured telephony provider. Every attempt is
          logged.
        </p>
      </header>

      <CommunicationComposer
        templates={templates}
        snippets={snippetResult.data ?? []}
      />

      <section className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5">
        <h2 className="font-semibold text-white">
          Message history
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-3">Channel</th>
                <th className="pb-3">Recipient</th>
                <th className="pb-3">Subject</th>
                <th className="pb-3">Provider</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Delivery</th>
              </tr>
            </thead>

            <tbody>
              {messages.map((message) => (
                <tr
                  key={message.id}
                  className="border-t border-white/10"
                >
                  <td className="py-3 uppercase text-cyan-300">
                    {message.channel}
                  </td>

                  <td className="py-3 text-slate-200">
                    {message.recipient}
                  </td>

                  <td className="py-3 text-slate-400">
                    {message.subject ||
                      message.body.slice(0, 50)}
                  </td>

                  <td className="py-3 text-slate-400">
                    {message.provider ?? '—'}
                  </td>

                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${statusStyle(
                        message.status,
                      )}`}
                    >
                      {message.status}
                    </span>

                    {message.error_message ? (
                      <p className="mt-2 max-w-xs text-xs text-red-300">
                        {message.error_message}
                      </p>
                    ) : null}
                  </td>

                  <td className="py-3 text-slate-500">
                    {deliveryTime(message)}
                  </td>
                </tr>
              ))}

              {messages.length === 0 ? (
                <tr className="border-t border-white/10">
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    No email or SMS messages have been sent from this
                    workspace.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}