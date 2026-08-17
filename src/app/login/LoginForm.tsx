'use client'

import { useActionState } from 'react'

import ErrorAlert from '@/components/ui/ErrorAlert'
import { signIn } from '@/app/auth/actions'

type AuthFormState = {
  status: 'idle' | 'error'
  message: string
}

const initialState: AuthFormState = {
  status: 'idle',
  message: '',
}

type LoginFormProps = {
  next: string
  prefilledEmail: string
}

export default function LoginForm({
  next,
  prefilledEmail,
}: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    signIn,
    initialState,
  )

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="text-sm text-slate-300">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={prefilledEmail}
          disabled={isPending}
          className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-300">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {state.status === 'error' && state.message ? (
        <ErrorAlert
          title="Sign-in could not be completed"
          message={state.message}
        />
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isPending ? 'Signing in…' : 'Login'}
      </button>
    </form>
  )
}
