'use client'

import { useRef } from 'react'
import { Plus } from 'lucide-react'

import { createContactNote } from '@/app/dashboard/contacts/actions'

type AddNoteDialogProps = {
  contactId: string
}

export default function AddNoteDialog({
  contactId,
}: AddNoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-400"
      >
        <Plus className="h-4 w-4" />
        Add Note
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl bg-[#0B1726] p-0 text-white backdrop:bg-black/60"
      >
        <form
          action={async (formData) => {
            await createContactNote(formData)
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
              Add Contact Note
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Save an internal note for this contact.
            </p>
          </div>

          <div className="p-6">
            <textarea
              name="body"
              required
              rows={8}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
              placeholder="Write your note..."
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-xl bg-cyan-500 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-400"
            >
              Save Note
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}