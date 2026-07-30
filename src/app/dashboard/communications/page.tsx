import { requireOrganization } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sendCommunication } from '../crm-actions'

export default async function CommunicationsPage() {
  const membership = await requireOrganization()
  const supabase = await createClient()

  const { data } = await supabase
    .from('communication_messages')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .limit(100)

  const fieldClass =
    'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Omnichannel inbox
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-white">
          Email &amp; SMS
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Send email through the organization&apos;s connected Gmail account
          when available, with Resend as the platform fallback. SMS uses the
          configured telephony provider. Every attempt is logged.
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
        <h2 className="font-semibold text-white">Message history</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-3">Channel</th>
                <th className="pb-3">Recipient</th>
                <th className="pb-3">Subject</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Sent</th>
              </tr>
            </thead>

            <tbody>
              {data?.map((message) => (
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
                    {message.subject || message.body.slice(0, 50)}
                  </td>

                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        message.status === 'sent' ||
                        message.status === 'delivered'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {message.status}
                    </span>
                  </td>

                  <td className="py-3 text-slate-500">
                    {new Date(message.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}