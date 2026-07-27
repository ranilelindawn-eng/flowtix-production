'use client'

import { useFormStatus } from 'react-dom'

type DeleteOpportunityButtonProps = {
  opportunityName: string
}

export default function DeleteOpportunityButton({
  opportunityName,
}: DeleteOpportunityButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            `Delete "${opportunityName}"? This opportunity will be permanently deleted.`,
          )
        ) {
          event.preventDefault()
        }
      }}
      className="min-h-9 w-full rounded-lg border border-red-400/30 bg-red-500/10 px-3 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}