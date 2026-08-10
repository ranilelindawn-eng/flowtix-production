import Link from 'next/link'
import { CalendarClock, CheckCircle2, CircleAlert, Clock3, Search } from 'lucide-react'

import { changeTaskStatus, deleteAdvancedTask } from '@/app/dashboard/tasks/actions'
import { CreateTaskDialog, EditTaskDialog } from '@/components/tasks/TaskDialogs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers } from '@/lib/team'
import type { AdvancedTask } from '@/lib/task-advanced'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type SearchParams = Promise<{ search?: string; status?: string; priority?: string; type?: string }>
type ContactRow = { id: string; first_name: string | null; last_name: string | null; email: string | null }

function formatDate(value: string | null, timeZone: string): string {
  if (!value) return 'No due date'
  return new Intl.DateTimeFormat('en', {
    timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function labelContact(contact: ContactRow): string {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
  return name || contact.email || 'Unnamed contact'
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const timeZone = await getCurrentOrganizationTimezone()
  const organization = await requirePermission('tasks.view')
  const { search = '', status = '', priority = '', type = '' } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('contact_tasks')
    .select('id,organization_id,contact_id,title,description,due_at,start_at,reminder_at,status,priority,task_type,source,assigned_to,owner_membership_id,created_by,completed_at,completed_by,cancelled_at,estimated_minutes,actual_minutes,recurrence_rule,recurrence_parent_id,outcome,blocked_reason,custom_fields,created_at,updated_at')
    .eq('organization_id', organization.organization_id)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status === 'pending' || status === 'completed' || status === 'cancelled') query = query.eq('status', status)
  if (priority === 'low' || priority === 'medium' || priority === 'high') query = query.eq('priority', priority)
  if (['follow_up','call','email','meeting','research','internal','other'].includes(type)) query = query.eq('task_type', type)
  if (search.trim()) query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`)

  const [tasksResult, contactsResult, members] = await Promise.all([
    query,
    supabase.from('contacts').select('id,first_name,last_name,email').eq('organization_id', organization.organization_id).is('merged_into_contact_id', null).order('first_name'),
    getTeamMembers(),
  ])
  if (tasksResult.error) throw new Error(tasksResult.error.message)
  if (contactsResult.error) throw new Error(contactsResult.error.message)

  const tasks = (tasksResult.data ?? []) as AdvancedTask[]
  const contacts = (contactsResult.data ?? []) as ContactRow[]
  const contactMap = new Map(contacts.map(contact => [contact.id, contact]))
  const contactOptions = contacts.map(contact => ({ id: contact.id, label: labelContact(contact) }))
  const memberOptions = members.map(member => ({ membershipId: member.id, label: member.profile?.full_name || member.profile?.email || member.user_id }))
  const pendingCount = tasks.filter(task => task.status === 'pending').length
  const scheduledCount = tasks.filter(task => task.status === 'pending' && task.due_at).length
  const completedCount = tasks.filter(task => task.status === 'completed').length

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium uppercase tracking-[.24em] text-cyan-400">CRM workspace</p><h1 className="mt-2 text-3xl font-semibold text-white">Tasks</h1><p className="mt-2 text-sm text-slate-400">Plan, assign, schedule, and complete contact work across the organization.</p></div><CreateTaskDialog contacts={contactOptions} members={memberOptions}/></header>

    <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"><div className="flex items-center gap-3 text-cyan-300"><Clock3 className="size-5"/><span className="text-sm">Pending</span></div><p className="mt-3 text-3xl font-semibold text-white">{pendingCount}</p></div><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"><div className="flex items-center gap-3 text-amber-300"><CircleAlert className="size-5"/><span className="text-sm">Scheduled</span></div><p className="mt-3 text-3xl font-semibold text-white">{scheduledCount}</p></div><div className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"><div className="flex items-center gap-3 text-emerald-300"><CheckCircle2 className="size-5"/><span className="text-sm">Completed</span></div><p className="mt-3 text-3xl font-semibold text-white">{completedCount}</p></div></section>

    <form className="grid gap-3 rounded-2xl border border-white/10 bg-[#0B1726]/90 p-4 md:grid-cols-[1fr_180px_180px_180px_auto]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"/><input name="search" defaultValue={search} placeholder="Search tasks" className="min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] pl-10 pr-4 text-sm text-white outline-none focus:border-cyan-500"/></label><select name="status" defaultValue={status} className="min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white"><option value="">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><select name="priority" defaultValue={priority} className="min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white"><option value="">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select name="type" defaultValue={type} className="min-h-11 rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white"><option value="">All types</option><option value="follow_up">Follow-up</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="research">Research</option><option value="internal">Internal</option><option value="other">Other</option></select><button className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15">Filter</button></form>

    <section className="space-y-3">{tasks.map(task => { const contact = contactMap.get(task.contact_id); return <article key={task.id} className="rounded-2xl border border-white/10 bg-[#0B1726]/90 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-white">{task.title}</h2><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs capitalize text-slate-300">{task.task_type.replace('_',' ')}</span><span className={`rounded-full px-2.5 py-1 text-xs capitalize ${task.priority === 'high' ? 'bg-rose-500/15 text-rose-300' : task.priority === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-500/15 text-slate-300'}`}>{task.priority}</span><span className={`rounded-full px-2.5 py-1 text-xs capitalize ${task.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : task.status === 'cancelled' ? 'bg-slate-500/15 text-slate-400' : 'bg-cyan-500/15 text-cyan-300'}`}>{task.status}</span></div>{task.description && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{task.description}</p>}<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><Link href={`/dashboard/contacts/${task.contact_id}`} className="hover:text-cyan-300">{contact ? labelContact(contact) : 'Contact'}</Link><span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5"/>{formatDate(task.due_at, timeZone)}</span>{task.estimated_minutes != null && <span>{task.estimated_minutes} min estimated</span>}{task.recurrence_rule && <span>Recurring</span>}</div></div><div className="flex flex-wrap items-center gap-2"><EditTaskDialog task={task} contacts={contactOptions} members={memberOptions}/>{task.status !== 'completed' && <form action={changeTaskStatus}><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="status" value="completed"/><button className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-400/15">Complete</button></form>}{task.status === 'completed' && <form action={changeTaskStatus}><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="status" value="pending"/><button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300">Reopen</button></form>}<form action={deleteAdvancedTask}><input type="hidden" name="taskId" value={task.id}/><button className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-400/10">Delete</button></form></div></div></article>})}{tasks.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-400">No tasks match the selected filters.</div>}</section>
  </div>
}
