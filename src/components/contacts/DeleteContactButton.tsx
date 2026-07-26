'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

import { deleteContact } from '@/app/dashboard/contacts/actions'

type Props = {
  contactId: string
  contactName: string
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
    >
      {pending ? 'Deleting...' : 'Delete contact'}
    </button>
  )
}

export default function DeleteContactButton({
  contactId,
  contactName,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
      >
        Delete contact
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1726] p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-white">
              Delete Contact
            </h2>

            <p className="mt-4 text-sm text-slate-300">
              Are you sure you want to permanently delete{' '}
              <strong>{contactName}</strong>?
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Cancel
              </button>

              <form action={deleteContact}>
                <input
                  type="hidden"
                  name="id"
                  value={contactId}
                />

                <SubmitButton />
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}