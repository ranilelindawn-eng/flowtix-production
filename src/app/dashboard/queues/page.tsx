import { ListOrdered } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function QueuesPage() {
  const organization = await requirePermission('team.view')
  const supabase = await createClient()
  const { data } = await supabase.from('call_queues').select('id, name, max_wait_seconds, max_size, is_active').eq('organization_id', organization.organization_id).order('name')
  return <div className="space-y-6"><div><p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Inbound routing</p><h1 className="mt-2 text-3xl font-semibold text-white">Call queues</h1><p className="mt-2 text-sm text-slate-400">Configure waiting limits and agent membership for inbound traffic.</p></div><div className="grid gap-4 lg:grid-cols-2">{(data ?? []).map((queue) => <article key={queue.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><span className="inline-flex rounded-2xl bg-blue-400/10 p-3 text-blue-300"><ListOrdered className="h-5 w-5"/></span><h2 className="mt-5 text-xl font-semibold text-white">{queue.name}</h2><p className="mt-2 text-sm text-slate-400">Max wait: {queue.max_wait_seconds}s · Capacity: {queue.max_size} · {queue.is_active ? 'Active' : 'Disabled'}</p></article>)}{(data ?? []).length === 0 && <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-400">No queues configured yet. The migration includes tenant-safe queue tables and member policies.</div>}</div></div>
}
