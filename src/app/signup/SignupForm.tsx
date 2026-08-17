'use client'

import { useActionState } from 'react'

import ErrorAlert from '@/components/ui/ErrorAlert'
import { signUp } from '@/app/auth/actions'

type AuthFormState = {
  status: 'idle' | 'error'
  message: string
}

const initialState: AuthFormState = {
  status: 'idle',
  message: '',
}

type SignupFormProps = {
  next: string
  plan: 'starter' | 'professional' | 'business'
  invitedEmail: string
  invitationSignup: boolean
}

export default function SignupForm({
  next,
  plan,
  invitedEmail,
  invitationSignup,
}: SignupFormProps) {
  const [state, formAction, isPending] = useActionState(
    signUp,
    initialState,
  )

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="invited_email" value={invitedEmail} />

      <label className="block">
        <span className="text-sm text-slate-300">Email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={invitedEmail}
          readOnly={invitationSignup}
          autoComplete="email"
          disabled={isPending}
          className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 read-only:cursor-not-allowed read-only:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-300">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={isPending}
          className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {state.status === 'error' && state.message ? (
        <ErrorAlert
          title="Account could not be created"
          message={state.message}
        />
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isPending
          ? invitationSignup
            ? 'Creating account…'
            : 'Starting trial…'
          : invitationSignup
            ? 'Sign up'
            : 'Start 7-Day Free Trial'}
      </button>
    </form>
  )
}
