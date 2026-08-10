import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sendCommunication } from '../crm-actions'

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
  const membership = await requirePermission('campaigns.view')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('communication_messages')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(
      `Failed to load communication history: ${error.message}`,
    )
  }

  const messages = (data ?? []) as CommunicationMessage[]

  const fieldClass =
    'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

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
      return new Date(message.sent_at).toLocaleString()
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

      <form
        action={sendCommunication}
        className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2"
      >
        <select name="channel" className={fieldClass}>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>

        <input
          required
          name="recipient"
          placeholder="Email address or E.164 phone number"
          className={fieldClass}
        />

        <input
          name="subject"
          placeholder="Subject (email only)"
          className={`${fieldClass} md:col-span-2`}
        />

        <textarea
          required
          name="body"
          rows={6}
          placeholder="Write your message"
          className={`${fieldClass} py-3 md:col-span-2`}
        />

        <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white md:col-span-2">
          Send message
        </button>
      </form>

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