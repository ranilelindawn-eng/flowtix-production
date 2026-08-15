import { Activity, PhoneCall } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { PROVIDER_DISPLAY_NAMES, isTelephonyProvider } from '@/lib/telephony/provider'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ACTIVE_CALL_STATUSES = ['initiating', 'queued', 'ringing', 'connected'] as const

function providerLabel(provider: string | null) {
  if (provider && isTelephonyProvider(provider)) return PROVIDER_DISPLAY_NAMES[provider]
  return 'Voice provider'
}

export default async function LiveCallsPage() {
  const organization = await requirePermission('calls.view')
  const supabase = await createClient()
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, direction, status, from_number, to_number, started_at, provider')
    .eq('organization_id', organization.organization_id)
    .in('status', [...ACTIVE_CALL_STATUSES])
    .order('started_at', { ascending: false })

  if (error) throw new Error(`Unable to load live calls: ${error.message}`)

  const liveCalls = calls ?? []
  const ringingCount = liveCalls.filter(
    (call) => call.status === 'initiating' || call.status === 'ringing',
  ).length
  const connectedCount = liveCalls.filter((call) => call.status === 'connected').length
  const queuedCount = liveCalls.filter((call) => call.status === 'queued').length

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Operations</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Live calls</h1>
        <p className="mt-2 text-sm text-slate-400">
          Monitor active SignalWire calls in one provider-aware view.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Ringing', count: ringingCount },
          { label: 'Connected', count: connectedCount },
          { label: 'Queued', count: queuedCount },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{item.count}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60">
        {liveCalls.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="mx-auto h-9 w-9 text-slate-600" />
            <p className="mt-3 font-semibold text-white">No active calls</p>
            <p className="mt-1 text-sm text-slate-400">
              Calls appear here automatically when SignalWire reports an active call.
            </p>
          </div>
        ) : (
          liveCalls.map((call) => (
            <div
              key={call.id}
              className="flex flex-col gap-3 border-b border-white/10 p-5 last:border-0 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
                  <PhoneCall className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-white">
                    {call.from_number ?? 'Browser'} → {call.to_number ?? 'Agent'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {call.direction} · {providerLabel(call.provider)}
                  </p>
                </div>
              </div>
              <span className="w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold capitalize text-emerald-300">
                {call.status === 'initiating' ? 'starting' : call.status}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
