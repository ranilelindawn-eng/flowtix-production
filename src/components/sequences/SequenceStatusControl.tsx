'use client'

import { useActionState } from 'react'

import { setSequenceStatus } from '@/app/dashboard/sequences/actions'
import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'

const initialState = {
  status: 'idle' as 'idle' | 'error',
  message: '',
}

type SequenceStatusControlProps = {
  sequenceId: string
  status: 'active' | 'paused' | 'archived'
}

export default function SequenceStatusControl({
  sequenceId,
  status,
}: SequenceStatusControlProps) {
  const [state, action, isPending] = useActionState(
    setSequenceStatus,
    initialState,
  )

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="sequence_id" value={sequenceId} />
        <input type="hidden" name="status" value={status} />
        <button
          disabled={isPending}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs capitalize text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Saving…' : status}
        </button>
      </form>

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="mt-2 max-w-xs text-xs leading-5 text-rose-300"
        >
          {getUserFacingErrorMessage(state.message, {
            context: 'general',
          })}
        </p>
      ) : null}
    </div>
  )
}
