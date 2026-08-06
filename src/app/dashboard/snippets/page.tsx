import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { createSnippet } from '../crm-actions'

const fieldClass =
  'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-blue-500'

export default async function SnippetsPage() {
  const membership = await requirePermission('campaigns.view')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('snippets')
    .select('id,name,shortcut,content,created_at')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load snippets: ${error.message}`)
  }

  const snippets = data ?? []

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Productivity
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Snippets
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Save frequently used responses and insert them consistently during
          customer outreach.
        </p>
      </header>

      <form
        action={createSnippet}
        className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2"
      >
        <input
          required
          name="name"
          placeholder="Snippet name"
          className={fieldClass}
        />
        <input
          required
          name="shortcut"
          placeholder="Shortcut, for example /intro"
          className={fieldClass}
        />
        <textarea
          required
          name="content"
          rows={4}
          placeholder="Reusable text"
          className={`${fieldClass} py-3 md:col-span-2`}
        />
        <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 md:col-span-2">
          Create snippet
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {snippets.map((snippet) => (
          <article
            key={snippet.id}
            className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">
                {snippet.name}
              </h2>
              <code className="rounded bg-white/5 px-2 py-1 text-xs text-cyan-300">
                {snippet.shortcut}
              </code>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-400">
              {snippet.content}
            </p>
          </article>
        ))}

        {snippets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center md:col-span-2">
            <p className="text-sm font-medium text-slate-300">
              No snippets have been created.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Create a reusable response above for faster customer messaging.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
