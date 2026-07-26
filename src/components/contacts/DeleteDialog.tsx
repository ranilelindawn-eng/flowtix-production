'use client'

import { useState } from 'react'

type DeleteDialogProps = {
  action: (formData: FormData) => Promise<void>
  id: string
}

export default function DeleteDialog({ action, id }: DeleteDialogProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-full border border-red-500 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
      >
        Delete contact
      </button>

      {isOpen ? (
        <form action={action} method="post" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
          <input type="hidden" name="id" value={id} />
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0B1726]/95 p-8 text-white shadow-xl">
            <h2 className="text-xl font-semibold">Confirm delete</h2>
            <p className="mt-4 text-slate-400">This action cannot be undone. The contact will be permanently removed.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  )
}
