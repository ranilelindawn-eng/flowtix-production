import { UsersRound } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function RingGroupsPage() {
  const organization = await requirePermission('team.view')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ring_groups')
    .select('id, name, strategy, ring_timeout_seconds, is_active')
    .eq('organization_id', organization.organization_id)
    .order('name')

  if (error) {
    throw new Error(`Failed to load ring groups: ${error.message}`)
  }

  const groups = data ?? []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Inbound routing
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Ring groups
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Route an inbound number to browser agents using a controlled ringing
          strategy.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <article
            key={group.id}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
                <UsersRound className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-slate-300">
                {group.strategy.replaceAll('_', ' ')}
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">
              {group.name}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Timeout: {group.ring_timeout_seconds}s ·{' '}
              {group.is_active ? 'Active' : 'Disabled'}
            </p>
          </article>
        ))}

        {groups.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center">
            <p className="text-sm font-medium text-slate-300">
              No ring groups have been configured.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Create a ring group when you are ready to route inbound calls to
              a selected set of available agents.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
