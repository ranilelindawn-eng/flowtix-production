'use client'

import { useRef } from 'react'
import { Pencil, Plus } from 'lucide-react'

import { createAdvancedTask, updateAdvancedTask } from '@/app/dashboard/tasks/actions'
import type { AdvancedTask } from '@/lib/task-advanced'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
import { toOrganizationDateTimeLocal } from '@/lib/timezone'
type ContactOption = { id: string; label: string }
type MemberOption = { membershipId: string; label: string }

type SharedProps = {
  contacts: ContactOption[]
  members: MemberOption[]
}

const fieldClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 text-sm text-white outline-none focus:border-cyan-500'
const labelClass = 'mb-2 block text-sm font-medium text-slate-200'

function TaskFields({ contacts, members, task }: SharedProps & { task?: AdvancedTask }) {
  const timeZone = useOrganizationTimezone()
  return <div className="grid gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><label className={labelClass}>Title</label><input name="title" required maxLength={200} defaultValue={task?.title ?? ''} className={fieldClass}/></div>
    <div className="sm:col-span-2"><label className={labelClass}>Description</label><textarea name="description" rows={4} maxLength={5000} defaultValue={task?.description ?? ''} className={`${fieldClass} py-3`}/></div>
    {!task && <div className="sm:col-span-2"><label className={labelClass}>Contact</label><select name="contactId" required defaultValue="" className={fieldClass}><option value="" disabled>Select a contact</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.label}</option>)}</select></div>}
    <div><label className={labelClass}>Task type</label><select name="taskType" defaultValue={task?.task_type ?? 'follow_up'} className={fieldClass}><option value="follow_up">Follow-up</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="research">Research</option><option value="internal">Internal</option><option value="other">Other</option></select></div>
    <div><label className={labelClass}>Priority</label><select name="priority" defaultValue={task?.priority ?? 'medium'} className={fieldClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
    {task && <div><label className={labelClass}>Status</label><select name="status" defaultValue={task.status} className={fieldClass}><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>}
    {!task && <div><label className={labelClass}>Assignee</label><select name="owner_membership_id" defaultValue="" className={fieldClass}><option value="">Assign to me</option>{members.map(member => <option key={member.membershipId} value={member.membershipId}>{member.label}</option>)}</select></div>}
    <div><label className={labelClass}>Start date</label><input name="startAt" type="datetime-local" defaultValue={toOrganizationDateTimeLocal(task?.start_at ?? null, timeZone)} className={fieldClass}/></div>
    <div><label className={labelClass}>Due date</label><input name="dueAt" type="datetime-local" defaultValue={toOrganizationDateTimeLocal(task?.due_at ?? null, timeZone)} className={fieldClass}/></div>
    <div><label className={labelClass}>Reminder</label><input name="reminderAt" type="datetime-local" defaultValue={toOrganizationDateTimeLocal(task?.reminder_at ?? null, timeZone)} className={fieldClass}/></div>
    <div><label className={labelClass}>Estimated minutes</label><input name="estimatedMinutes" type="number" min={1} max={10080} defaultValue={task?.estimated_minutes ?? ''} className={fieldClass}/></div>
    {task && <div><label className={labelClass}>Actual minutes</label><input name="actualMinutes" type="number" min={0} max={10080} defaultValue={task.actual_minutes ?? ''} className={fieldClass}/></div>}
    <div><label className={labelClass}>Recurrence rule</label><input name="recurrenceRule" maxLength={300} placeholder="Optional, for example FREQ=WEEKLY" defaultValue={task?.recurrence_rule ?? ''} className={fieldClass}/></div>
    {task && <><div className="sm:col-span-2"><label className={labelClass}>Outcome</label><textarea name="outcome" rows={3} defaultValue={task.outcome ?? ''} className={`${fieldClass} py-3`}/></div><div className="sm:col-span-2"><label className={labelClass}>Blocked reason</label><textarea name="blockedReason" rows={2} defaultValue={task.blocked_reason ?? ''} className={`${fieldClass} py-3`}/></div></>}
  </div>
}

export function CreateTaskDialog({ contacts, members }: SharedProps) {
  const ref = useRef<HTMLDialogElement>(null)
  return <><button type="button" onClick={() => ref.current?.showModal()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"><Plus className="size-4"/>New task</button><dialog ref={ref} className="w-full max-w-2xl rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/70"><form action={async formData => { await createAdvancedTask(formData); ref.current?.close() }}><div className="border-b border-white/10 px-6 py-5"><h2 className="text-lg font-semibold">Create task</h2><p className="mt-1 text-sm text-slate-400">Create an owned CRM task with scheduling, reminder, and recurrence details.</p></div><div className="max-h-[70vh] overflow-y-auto p-6"><TaskFields contacts={contacts} members={members}/></div><div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" onClick={() => ref.current?.close()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200">Cancel</button><button type="submit" className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-400">Create task</button></div></form></dialog></>
}

export function EditTaskDialog({ task, contacts, members }: SharedProps & { task: AdvancedTask }) {
  const ref = useRef<HTMLDialogElement>(null)
  return <><button type="button" onClick={() => ref.current?.showModal()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-400/30 hover:text-cyan-200"><Pencil className="size-3.5"/>Edit</button><dialog ref={ref} className="w-full max-w-2xl rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/70"><form action={async formData => { await updateAdvancedTask(formData); ref.current?.close() }}><input type="hidden" name="taskId" value={task.id}/><div className="border-b border-white/10 px-6 py-5"><h2 className="text-lg font-semibold">Edit task</h2><p className="mt-1 text-sm text-slate-400">Update execution, scheduling, outcome, or status details.</p></div><div className="max-h-[70vh] overflow-y-auto p-6"><TaskFields contacts={contacts} members={members} task={task}/></div><div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5"><button type="button" onClick={() => ref.current?.close()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200">Cancel</button><button type="submit" className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-400">Save changes</button></div></form></dialog></>
}
