'use client'

import { useRef } from 'react'
import { Pencil } from 'lucide-react'

import { updateContactTask } from '@/app/dashboard/contacts/actions'
import type { ContactTask } from '@/lib/contact-tasks'

type EditTaskDialogProps = {
  contactId: string
  task: ContactTask
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part: number) => part.toString().padStart(2, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

export default function EditTaskDialog({
  contactId,
  task,
}: EditTaskDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-200"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/60"
      >
        <form
          action={async (formData) => {
            await updateContactTask(formData)
            dialogRef.current?.close()
          }}
        >
          <input
            type="hidden"
            name="taskId"
            value={task.id}
          />

          <input
            type="hidden"
            name="contactId"
            value={contactId}
          />

          <input type="hidden" name="taskType" value={task.task_type} />
          <input type="hidden" name="startAt" value={task.start_at ?? ''} />
          <input type="hidden" name="reminderAt" value={task.reminder_at ?? ''} />
          <input type="hidden" name="estimatedMinutes" value={task.estimated_minutes ?? ''} />
          <input type="hidden" name="actualMinutes" value={task.actual_minutes ?? ''} />
          <input type="hidden" name="recurrenceRule" value={task.recurrence_rule ?? ''} />
          <input type="hidden" name="outcome" value={task.outcome ?? ''} />
          <input type="hidden" name="blockedReason" value={task.blocked_reason ?? ''} />

          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-lg font-semibold">
              Edit Follow-up Task
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Update the task details, priority, due date, or status.
            </p>
          </div>

          <div className="space-y-5 p-6">
            <div>
              <label
                htmlFor={`task-title-${task.id}`}
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Task title
              </label>

              <input
                id={`task-title-${task.id}`}
                name="title"
                type="text"
                required
                maxLength={200}
                autoComplete="off"
                defaultValue={task.title}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500"
              />
            </div>

            <div>
              <label
                htmlFor={`task-description-${task.id}`}
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Description
              </label>

              <textarea
                id={`task-description-${task.id}`}
                name="description"
                rows={5}
                maxLength={5000}
                defaultValue={task.description ?? ''}
                className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`task-due-at-${task.id}`}
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Due date and time
                </label>

                <input
                  id={`task-due-at-${task.id}`}
                  name="dueAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocalValue(task.due_at)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label
                  htmlFor={`task-priority-${task.id}`}
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Priority
                </label>

                <select
                  id={`task-priority-${task.id}`}
                  name="priority"
                  defaultValue={task.priority}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor={`task-status-${task.id}`}
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Status
              </label>

              <select
                id={`task-status-${task.id}`}
                name="status"
                defaultValue={task.status}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-cyan-400"
            >
              Save Changes
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
