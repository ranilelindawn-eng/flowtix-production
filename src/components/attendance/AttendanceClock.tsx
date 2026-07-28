'use client'

import { useActionState } from 'react'
import { Clock3, LogIn, LogOut } from 'lucide-react'

import {
  clockIn,
  clockOut,
  type AttendanceActionState,
} from '@/app/dashboard/attendance/actions'

const initialState: AttendanceActionState = {
  status: 'idle',
  message: '',
}

type AttendanceClockProps = {
  isClockedIn: boolean
  clockedInAt: string | null
}

export default function AttendanceClock({
  isClockedIn,
  clockedInAt,
}: AttendanceClockProps) {
  const [clockInState, clockInAction, clockInPending] =
    useActionState(clockIn, initialState)
  const [clockOutState, clockOutAction, clockOutPending] =
    useActionState(clockOut, initialState)

  const state =
    clockOutState.status !== 'idle' ? clockOutState : clockInState
  const pending = clockInPending || clockOutPending

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-400">
            <Clock3 className="h-4 w-4" />
            Your time clock
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">
            {isClockedIn ? 'Currently on duty' : 'Currently off duty'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {isClockedIn && clockedInAt
              ? `Clocked in ${new Date(clockedInAt).toLocaleString()}`
              : 'Clock in when your workday starts.'}
          </p>
        </div>

        <form action={isClockedIn ? clockOutAction : clockInAction}>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-w-40 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isClockedIn ? (
              <LogOut className="h-5 w-5" />
            ) : (
              <LogIn className="h-5 w-5" />
            )}
            {pending
              ? 'Saving...'
              : isClockedIn
                ? 'Time Out'
                : 'Time In'}
          </button>
        </form>
      </div>

      {state.status !== 'idle' ? (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            state.status === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/20 bg-red-500/10 text-red-300'
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  )
}
