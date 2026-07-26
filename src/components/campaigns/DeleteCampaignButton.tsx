'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

import { deleteCampaign } from '@/app/dashboard/campaigns/actions'

type DeleteCampaignButtonProps = {
  campaignId: string
  campaignName: string
}

function ConfirmDeleteButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Deleting…' : 'Delete campaign'}
    </button>
  )
}

export default function DeleteCampaignButton({
  campaignId,
  campaignName,
}: DeleteCampaignButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-200"
      >
        Delete campaign
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-campaign-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h2
              id="delete-campaign-title"
              className="text-xl font-semibold text-white"
            >
              Delete campaign?
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">{campaignName}</strong>? This
              action cannot be undone.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
              >
                Cancel
              </button>

              <form action={deleteCampaign}>
                <input type="hidden" name="id" value={campaignId} />
                <ConfirmDeleteButton />
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}