import { requireFeature } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import { createSequence } from '../crm-actions'

export default async function SequencesPage() {
  const membership = await requireFeature(
    'automation.sequences',
    'campaigns.view',
  )
  const supabase = await createClient()
  const { data } = await supabase
    .from('sequences')
    .select('*,sequence_steps(*)')
    .eq(
      'organization_id',
      membership.organization_id,
    )
    .order('created_at', { ascending: false })

  const fieldClass =
    'min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white'

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[.24em] text-cyan-400">
          Sales automation
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Sequences
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Build multi-step email, SMS, task, and call
          follow-up workflows.
        </p>
      </header>

      <form
        action={createSequence}
        className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5 md:grid-cols-2"
      >
        <input
          required
          name="name"
          placeholder="Sequence name"
          className={fieldClass}
        />
        <select name="channel" className={fieldClass}>
          <option value="email">Email first step</option>
          <option value="sms">SMS first step</option>
          <option value="task">Task first step</option>
          <option value="call">Call first step</option>
        </select>
        <input
          name="description"
          placeholder="Description"
          className={`${fieldClass} md:col-span-2`}
        />
        <input
          name="subject"
          placeholder="First-step subject"
          className={`${fieldClass} md:col-span-2`}
        />
        <textarea
          required
          name="body"
          rows={4}
          placeholder="First-step content"
          className={`${fieldClass} py-3 md:col-span-2`}
        />
        <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white md:col-span-2">
          Create sequence
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((sequence) => (
          <article
            key={sequence.id}
            className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"
          >
            <div className="flex justify-between">
              <h2 className="font-semibold text-white">
                {sequence.name}
              </h2>
              <span className="rounded-full border border-white/10 px-2 py-1 text-xs capitalize text-slate-300">
                {sequence.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {sequence.description || 'No description'}
            </p>
            <p className="mt-4 text-xs text-cyan-300">
              {sequence.sequence_steps?.length || 0}{' '}
              configured steps
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
