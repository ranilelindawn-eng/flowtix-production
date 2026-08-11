import { ListOrdered } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers } from '@/lib/team'
import { createCallQueue, deleteCallQueue, updateCallQueue } from './actions'

const priorityModes = [
  ['fifo', 'FIFO'],
  ['priority', 'Priority'],
] as const

export default async function QueuesPage() {
  const organization = await requirePermission('team.view')
  const supabase = await createClient()
  const organizationId = organization.organization_id
  const canManage = hasPermission(organization.role, 'settings.manage')

  const [queuesResult, membersResult, teamMembers] = await Promise.all([
    supabase
      .from('call_queues')
      .select('id, name, max_wait_seconds, max_size, priority_mode, overflow_queue_id, overflow_number, reservation_timeout_seconds, target_answer_seconds, average_handle_seconds, max_requeue_attempts, announce_position, announce_estimated_wait, is_active')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase
      .from('queue_members')
      .select('queue_id, user_id, priority, is_active, max_concurrent_calls')
      .eq('organization_id', organizationId)
      .order('priority'),
    getTeamMembers(),
  ])

  if (queuesResult.error) throw new Error(`Failed to load call queues: ${queuesResult.error.message}`)
  if (membersResult.error) throw new Error(`Failed to load queue members: ${membersResult.error.message}`)

  const queues = queuesResult.data ?? []
  const queueMembers = membersResult.data ?? []
  const memberName = new Map(
    teamMembers.map((member) => [
      member.user_id,
      member.profile?.full_name || member.profile?.email || member.user_id,
    ]),
  )

  const fields = (queue?: (typeof queues)[number]) => (
    <>
      <label className="text-sm text-slate-300">Name<input name="name" required defaultValue={queue?.name ?? ''} placeholder="Sales queue" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Ordering<select name="priority_mode" defaultValue={queue?.priority_mode ?? 'fifo'} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white">{priorityModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm text-slate-300">Max wait (seconds)<input name="max_wait_seconds" type="number" min="30" max="3600" defaultValue={queue?.max_wait_seconds ?? 300} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Queue capacity<input name="max_size" type="number" min="1" max="1000" defaultValue={queue?.max_size ?? 50} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Overflow queue<select name="overflow_queue_id" defaultValue={queue?.overflow_queue_id ?? ''} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"><option value="">None</option>{queues.filter((candidate) => candidate.id !== queue?.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      <label className="text-sm text-slate-300">Overflow number<input name="overflow_number" defaultValue={queue?.overflow_number ?? ''} placeholder="+15551234567" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Reservation timeout<input name="reservation_timeout_seconds" type="number" min="5" max="300" defaultValue={queue?.reservation_timeout_seconds ?? 30} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Target answer time<input name="target_answer_seconds" type="number" min="5" max="120" defaultValue={queue?.target_answer_seconds ?? 20} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Average handle time<input name="average_handle_seconds" type="number" min="15" max="14400" defaultValue={queue?.average_handle_seconds ?? 300} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
      <label className="text-sm text-slate-300">Max requeue attempts<input name="max_requeue_attempts" type="number" min="0" max="20" defaultValue={queue?.max_requeue_attempts ?? 3} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
    </>
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Inbound routing</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Call queues</h1>
        <p className="mt-2 text-sm text-slate-400">Configure waiting limits, overflow behavior, announcements, and agent membership for inbound traffic.</p>
      </div>

      {canManage && (
        <form action={createCallQueue} className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div><h2 className="text-lg font-semibold text-white">Create call queue</h2><p className="mt-1 text-sm text-slate-400">Create an organization-scoped waiting queue for inbound callers.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{fields()}</div>
          <fieldset><legend className="text-sm font-medium text-slate-300">Agents</legend><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{teamMembers.map((member) => <label key={member.user_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="member_ids" value={member.user_id} />{member.profile?.full_name || member.profile?.email || member.user_id}<span className="ml-auto text-xs capitalize text-slate-500">{member.role}</span></label>)}</div></fieldset>
          <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="announce_position" defaultChecked />Announce queue position</label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="announce_estimated_wait" defaultChecked />Announce estimated wait</label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="is_active" defaultChecked />Active</label></div>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Create call queue</button>
        </form>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {queues.map((queue) => {
          const assigned = queueMembers.filter((member) => member.queue_id === queue.id && member.is_active)
          return (
            <article key={queue.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between gap-4"><span className="rounded-2xl bg-blue-400/10 p-3 text-blue-300"><ListOrdered className="h-5 w-5" /></span><span className="rounded-full bg-white/5 px-3 py-1 text-xs uppercase text-slate-300">{queue.priority_mode}</span></div>
              <h2 className="mt-5 text-xl font-semibold text-white">{queue.name}</h2>
              <p className="mt-2 text-sm text-slate-400">Max wait: {queue.max_wait_seconds}s · Capacity: {queue.max_size} · {assigned.length} agent{assigned.length === 1 ? '' : 's'} · {queue.is_active ? 'Active' : 'Disabled'}</p>
              {assigned.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">{assigned.map((member) => memberName.get(member.user_id) ?? member.user_id).join(' · ')}</p>}

              {canManage && (
                <form action={updateCallQueue} className="mt-5 space-y-4 border-t border-white/10 pt-5">
                  <input type="hidden" name="id" value={queue.id} />
                  <div className="grid gap-3 md:grid-cols-2">{fields(queue)}</div>
                  <fieldset><legend className="text-xs text-slate-400">Agents</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{teamMembers.map((member) => <label key={member.user_id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300"><input type="checkbox" name="member_ids" value={member.user_id} defaultChecked={assigned.some((assignedMember) => assignedMember.user_id === member.user_id)} />{member.profile?.full_name || member.profile?.email || member.user_id}</label>)}</div></fieldset>
                  <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="announce_position" defaultChecked={queue.announce_position} />Announce position</label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="announce_estimated_wait" defaultChecked={queue.announce_estimated_wait} />Announce estimated wait</label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="is_active" defaultChecked={queue.is_active} />Active</label></div>
                  <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Save call queue</button>
                </form>
              )}
              {canManage && <form action={deleteCallQueue} className="mt-3"><input type="hidden" name="id" value={queue.id} /><button className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20">Delete call queue</button></form>}
            </article>
          )
        })}

        {queues.length === 0 && <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><p className="text-sm font-medium text-slate-300">No call queues have been configured.</p><p className="mt-2 text-sm leading-6 text-slate-500">Create a queue when you are ready to place inbound callers on hold and route them to available agents.</p></div>}
      </div>
    </div>
  )
}
