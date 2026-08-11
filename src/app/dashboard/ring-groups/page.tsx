import { UsersRound } from 'lucide-react'

import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers } from '@/lib/team'
import { createRingGroup, deleteRingGroup, updateRingGroup } from './actions'

const strategies = [
  ['simultaneous', 'Simultaneous'],
  ['sequential', 'Sequential'],
  ['round_robin', 'Round robin'],
  ['least_recently_called', 'Least recently called'],
  ['longest_idle', 'Longest idle'],
  ['weighted', 'Weighted'],
] as const

export default async function RingGroupsPage() {
  const organization = await requirePermission('team.view')
  const supabase = await createClient()
  const organizationId = organization.organization_id
  const canManage = hasPermission(organization.role, 'settings.manage')

  const [groupsResult, membersResult, queuesResult, teamMembers] = await Promise.all([
    supabase
      .from('ring_groups')
      .select('id, name, strategy, ring_timeout_seconds, overflow_timeout_seconds, max_routing_targets, overflow_ring_group_id, failover_queue_id, failover_number, is_active')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase
      .from('ring_group_members')
      .select('ring_group_id, user_id, priority, weight, is_active')
      .eq('organization_id', organizationId)
      .order('priority'),
    supabase
      .from('call_queues')
      .select('id, name, is_active')
      .eq('organization_id', organizationId)
      .order('name'),
    getTeamMembers(),
  ])

  if (groupsResult.error) throw new Error(`Failed to load ring groups: ${groupsResult.error.message}`)
  if (membersResult.error) throw new Error(`Failed to load ring-group members: ${membersResult.error.message}`)
  if (queuesResult.error) throw new Error(`Failed to load call queues: ${queuesResult.error.message}`)

  const groups = groupsResult.data ?? []
  const groupMembers = membersResult.data ?? []
  const queues = queuesResult.data ?? []
  const memberName = new Map(
    teamMembers.map((member) => [
      member.user_id,
      member.profile?.full_name || member.profile?.email || member.user_id,
    ]),
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Inbound routing</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Ring groups</h1>
        <p className="mt-2 text-sm text-slate-400">
          Route inbound numbers to available browser agents using controlled ringing, overflow, and failover rules.
        </p>
      </div>

      {canManage && (
        <form action={createRingGroup} className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Create ring group</h2>
            <p className="mt-1 text-sm text-slate-400">Create the routing group first. Inbound numbers can then target it through Flowtix telephony routing.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm text-slate-300">Name<input name="name" required placeholder="Sales team" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Strategy<select name="strategy" defaultValue="simultaneous" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white">{strategies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm text-slate-300">Ring timeout (seconds)<input name="ring_timeout_seconds" type="number" min="5" max="120" defaultValue="25" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Max routing targets<input name="max_routing_targets" type="number" min="1" max="50" defaultValue="10" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Overflow group<select name="overflow_ring_group_id" defaultValue="" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"><option value="">None</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label className="text-sm text-slate-300">Overflow timeout (seconds)<input name="overflow_timeout_seconds" type="number" min="5" max="120" defaultValue="20" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">Failover queue<select name="failover_queue_id" defaultValue="" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white"><option value="">None</option>{queues.filter((queue) => queue.is_active).map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}</select></label>
            <label className="text-sm text-slate-300">Failover number<input name="failover_number" placeholder="+15551234567" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-white" /></label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-300">Agents</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map((member) => <label key={member.user_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="member_ids" value={member.user_id} />{member.profile?.full_name || member.profile?.email || member.user_id}<span className="ml-auto text-xs capitalize text-slate-500">{member.role}</span></label>)}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="is_active" defaultChecked />Active</label>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Create ring group</button>
        </form>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => {
          const assigned = groupMembers.filter((member) => member.ring_group_id === group.id && member.is_active)
          return (
            <article key={group.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between gap-4"><span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><UsersRound className="h-5 w-5" /></span><span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-slate-300">{group.strategy.replaceAll('_', ' ')}</span></div>
              <h2 className="mt-5 text-xl font-semibold text-white">{group.name}</h2>
              <p className="mt-2 text-sm text-slate-400">Timeout: {group.ring_timeout_seconds}s · {assigned.length} agent{assigned.length === 1 ? '' : 's'} · {group.is_active ? 'Active' : 'Disabled'}</p>
              {assigned.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">{assigned.map((member) => memberName.get(member.user_id) ?? member.user_id).join(' · ')}</p>}

              {canManage && (
                <form action={updateRingGroup} className="mt-5 space-y-4 border-t border-white/10 pt-5">
                  <input type="hidden" name="id" value={group.id} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-400">Name<input name="name" required defaultValue={group.name} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-slate-400">Strategy<select name="strategy" defaultValue={group.strategy} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white">{strategies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="text-xs text-slate-400">Ring timeout<input name="ring_timeout_seconds" type="number" min="5" max="120" defaultValue={group.ring_timeout_seconds} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-slate-400">Max targets<input name="max_routing_targets" type="number" min="1" max="50" defaultValue={group.max_routing_targets} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-slate-400">Overflow group<select name="overflow_ring_group_id" defaultValue={group.overflow_ring_group_id ?? ''} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"><option value="">None</option>{groups.filter((candidate) => candidate.id !== group.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
                    <label className="text-xs text-slate-400">Overflow timeout<input name="overflow_timeout_seconds" type="number" min="5" max="120" defaultValue={group.overflow_timeout_seconds} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /></label>
                    <label className="text-xs text-slate-400">Failover queue<select name="failover_queue_id" defaultValue={group.failover_queue_id ?? ''} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"><option value="">None</option>{queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}</select></label>
                    <label className="text-xs text-slate-400">Failover number<input name="failover_number" defaultValue={group.failover_number ?? ''} placeholder="+15551234567" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /></label>
                  </div>
                  <fieldset><legend className="text-xs text-slate-400">Agents</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{teamMembers.map((member) => <label key={member.user_id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300"><input type="checkbox" name="member_ids" value={member.user_id} defaultChecked={assigned.some((assignedMember) => assignedMember.user_id === member.user_id)} />{member.profile?.full_name || member.profile?.email || member.user_id}</label>)}</div></fieldset>
                  <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="is_active" defaultChecked={group.is_active} />Active</label>
                  <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Save ring group</button>
                </form>
              )}
              {canManage && <form action={deleteRingGroup} className="mt-3"><input type="hidden" name="id" value={group.id} /><button className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20">Delete ring group</button></form>}
            </article>
          )
        })}

        {groups.length === 0 && <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><p className="text-sm font-medium text-slate-300">No ring groups have been configured.</p><p className="mt-2 text-sm leading-6 text-slate-500">Create a ring group to route inbound calls to a selected set of available agents.</p></div>}
      </div>
    </div>
  )
}
