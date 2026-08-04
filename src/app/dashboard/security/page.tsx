import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import MfaManager from '@/components/security/MfaManager'

export const dynamic = 'force-dynamic'

type AuditLogRow = {
  id: string
  action: string
  resource_type: string | null
  resource_id: string | null
  outcome: string | null
  source: string | null
  request_id: string | null
  ip_address: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

function formatResource(log: AuditLogRow): string {
  if (!log.resource_type) return '—'
  return log.resource_id
    ? `${log.resource_type} · ${log.resource_id}`
    : log.resource_type
}

function outcomeClass(outcome: string | null): string {
  if (outcome === 'failure' || outcome === 'denied') {
    return 'bg-red-500/10 text-red-300'
  }
  return 'bg-emerald-500/10 text-emerald-300'
}

export default async function SecurityCenterPage() {
  const organization = await requirePermission('audit_logs.view')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: sessions }, { data: rawLogs, error: logsError }] =
    await Promise.all([
      supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user?.id ?? '')
        .order('last_seen_at', { ascending: false })
        .limit(20),
      supabase
        .from('audit_logs')
        .select(
          'id,action,resource_type,resource_id,outcome,source,request_id,ip_address,metadata,created_at',
        )
        .eq('organization_id', organization.organization_id)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

  if (logsError) {
    throw new Error(`Unable to load audit logs: ${logsError.message}`)
  }

  const logs = (rawLogs ?? []) as AuditLogRow[]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[.28em] text-cyan-300">
          Security
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Security Center</h1>
        <p className="mt-2 text-slate-400">
          Manage authentication, sessions, devices, and review auditable
          workspace activity.
        </p>
      </div>

      <MfaManager />

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Sessions and device history</h2>
        <div className="mt-4 space-y-3">
          {sessions?.length ? (
            sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-white/10 p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">
                    {session.device_name || 'Unknown device'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(session.last_seen_at).toLocaleString()}
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {session.ip_address || 'Unknown IP'} ·{' '}
                  {session.user_agent || 'Unknown browser'}
                </p>
                {session.revoked_at ? (
                  <p className="mt-2 text-xs text-red-300">Revoked</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">
              Session records appear after the tracking endpoint is enabled.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Audit logs</h2>
            <p className="mt-1 text-sm text-slate-400">
              Immutable security and business-operation events for this
              workspace. The newest 100 events are shown.
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
            {logs.length} events
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-3">Action</th>
                <th className="pb-3">Outcome</th>
                <th className="pb-3">Resource</th>
                <th className="pb-3">Source</th>
                <th className="pb-3">Request</th>
                <th className="pb-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length ? (
                logs.map((log) => (
                  <tr key={log.id} className="border-t border-white/10">
                    <td className="py-3 font-medium text-white">
                      {log.action}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${outcomeClass(log.outcome)}`}
                      >
                        {log.outcome ?? 'success'}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300">
                      {formatResource(log)}
                    </td>
                    <td className="py-3 text-slate-400">
                      {log.source ?? 'application'}
                    </td>
                    <td className="max-w-48 truncate py-3 font-mono text-xs text-slate-500">
                      {log.request_id ?? '—'}
                    </td>
                    <td className="whitespace-nowrap py-3 text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No audit events have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
