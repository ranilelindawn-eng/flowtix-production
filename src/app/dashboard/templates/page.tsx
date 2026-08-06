import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { createTemplate } from '../crm-actions'

const fieldClass =
  'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function TemplatesPage() {
  const membership = await requirePermission('campaigns.view')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('message_templates')
    .select('id,name,channel,subject,body,created_at')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load message templates: ${error.message}`)
  }

  const templates = data ?? []

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Reusable content
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Templates
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Create reusable email and SMS content for campaigns and customer
          follow-up.
        </p>
      </header>

      <form
        action={createTemplate}
        className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2"
      >
        <input
          required
          name="name"
          placeholder="Template name"
          className={fieldClass}
        />
        <select name="channel" className={fieldClass}>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <input
          name="subject"
          placeholder="Subject (email only)"
          className={`${fieldClass} md:col-span-2`}
        />
        <textarea
          required
          name="body"
          rows={5}
          placeholder="Message body. Use {{first_name}}, {{company}}, and other merge fields."
          className={`${fieldClass} py-3 md:col-span-2`}
        />
        <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 md:col-span-2">
          Save template
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => (
          <article
            key={template.id}
            className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"
          >
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold text-white">
                {template.name}
              </h2>
              <span className="text-xs uppercase text-cyan-400">
                {template.channel}
              </span>
            </div>
            {template.subject ? (
              <p className="mt-3 text-sm font-medium text-slate-300">
                {template.subject}
              </p>
            ) : null}
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-400">
              {template.body}
            </p>
          </article>
        ))}

        {templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center md:col-span-2">
            <p className="text-sm font-medium text-slate-300">
              No message templates have been created.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Save reusable content above to speed up email and SMS outreach.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
