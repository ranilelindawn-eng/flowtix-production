'use client'

import { useFormStatus } from 'react-dom'

type DeletePipelineButtonProps = {
  pipelineName: string
}

export default function DeletePipelineButton({
  pipelineName,
}: DeletePipelineButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            `Delete "${pipelineName}"? All stages and opportunities in this pipeline will be permanently deleted.`,
          )
        ) {
          event.preventDefault()
        }
      }}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Deleting…' : 'Delete pipeline'}
    </button>
  )
}