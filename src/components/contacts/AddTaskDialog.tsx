'use client'

import { useRef } from 'react'
import { CalendarPlus } from 'lucide-react'

import { createContactTask } from '@/app/dashboard/contacts/actions'

type AddTaskDialogProps = {
  contactId: string
}

export default function AddTaskDialog({
  contactId,
}: AddTaskDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/15"
      >
        <CalendarPlus className="h-4 w-4" />
        New Follow-up
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/60"
      >
        <form
          action={async (formData) => {
            await createContactTask(formData)
            dialogRef.current?.close()
          }}
        >
          <input
            type="hidden"
            name="contactId"
            value={contactId}
          />

          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-lg font-semibold">
              Create Follow-up Task
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Schedule the next action for this contact.
            </p>
          </div>

          <div className="space-y-5 p-6">
            <div>
              <label
                htmlFor="task-title"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Task title
              </label>

              <input
                id="task-title"
                name="title"
                type="text"
                required
                maxLength={200}
                autoComplete="off"
                placeholder="Follow up about the proposal"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500"
              />
            </div>

            <div>
              <label
                htmlFor="task-description"
                className="mb-2 block text-sm font-medium text-slate-200"
              >
                Description
              </label>

              <textarea
                id="task-description"
                name="description"
                rows={5}
                placeholder="Add details or instructions..."
                className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="task-due-at"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Due date and time
                </label>

                <input
                  id="task-due-at"
                  name="dueAt"
                  type="datetime-local"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label
                  htmlFor="task-priority"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Priority
                </label>

                <select
                  id="task-priority"
                  name="priority"
                  defaultValue="medium"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
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
              Create Task
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}