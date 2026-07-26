'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PASSWORD_RESET_REDIRECT_URL =
  'https://callflow-crm.netlify.app/auth/callback?next=/reset-password'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      setMessage('')
      setErrorMessage('Please enter your email address.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    setErrorMessage('')

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: PASSWORD_RESET_REDIRECT_URL,
        },
      )

      if (error) {
        const lowerCaseMessage = error.message.toLowerCase()

        const isRateLimited =
          error.status === 429 ||
          lowerCaseMessage.includes('rate limit') ||
          lowerCaseMessage.includes('too many requests') ||
          lowerCaseMessage.includes('for security purposes')

        if (isRateLimited) {
          setErrorMessage(
            'Too many reset requests were made. Please wait before trying again.',
          )
          return
        }

        setErrorMessage(error.message)
        return
      }

      setMessage(
        'Password reset instructions have been sent. Check your email and open only the newest reset link in this same browser.',
      )
      setEmail('')
    } catch (error) {
      console.error('Password reset request failed:', error)

      setErrorMessage(
        'We could not send the reset email. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="rounded-[2rem] border border-white/10 bg-[#0C1728]/90 p-10 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">
              Reset password
            </p>

            <h1 className="mt-4 text-3xl font-semibold text-white">
              Forgot your password?
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <label className="block">
              <span className="text-sm text-slate-300">
                Email
              </span>

              <input
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={isSubmitting}
                className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            {message ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
              >
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {isSubmitting
                ? 'Sending reset email...'
                : 'Send reset email'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Remembered your password?{' '}
            <Link
              href="/login"
              className="text-[#22D3EE] underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}