'use client'

import Link from 'next/link'
import {
  FormEvent,
  useEffect,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { getUserFacingErrorMessage } from '@/lib/errors/user-facing'
import { createRecoveryClient } from '@/lib/supabase/recovery-client'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')
  const [errorMessage, setErrorMessage] =
    useState('')
  const [isRecoveryReady, setIsRecoveryReady] =
    useState(false)
  const [isCheckingRecovery, setIsCheckingRecovery] =
    useState(true)
  const [isSubmitting, setIsSubmitting] =
    useState(false)

  useEffect(() => {
    const supabase = createRecoveryClient()

    let isMounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) {
          return
        }

        if (
          event === 'PASSWORD_RECOVERY' &&
          session
        ) {
          setIsRecoveryReady(true)
          setIsCheckingRecovery(false)
        }
      },
    )

    async function checkExistingSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error(
          'Recovery session check failed:',
          error,
        )
      }

      if (session) {
        setIsRecoveryReady(true)
      }

      setIsCheckingRecovery(false)
    }

    void checkExistingSession()

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setErrorMessage('')

    if (!isRecoveryReady) {
      setErrorMessage(
        'This password reset link is invalid or has expired. Request a new reset email.',
      )
      return
    }

    if (password.length < 8) {
      setErrorMessage(
        'Your password must contain at least 8 characters.',
      )
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage(
        'The passwords do not match.',
      )
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createRecoveryClient()

      const { error } =
        await supabase.auth.updateUser({
          password,
        })

      if (error) {
        setErrorMessage(
          getUserFacingErrorMessage(error, {
            context: 'password-reset',
          }),
        )
        return
      }

      await supabase.auth.signOut()

      router.replace(
        '/login?password=updated',
      )
      router.refresh()
    } catch (error) {
      console.error(
        'Password update failed:',
        error,
      )

      setErrorMessage(
        getUserFacingErrorMessage(error, {
          context: 'password-reset',
          fallbackMessage:
            'We could not update your password. Please request a new reset link and try again.',
        }),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCheckingRecovery) {
    return (
      <div className="min-h-screen bg-[#07111F] text-white">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 py-16">
          <p className="text-sm text-slate-300">
            Verifying your reset link...
          </p>
        </div>
      </div>
    )
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
              Set a new password
            </h1>
          </div>

          {!isRecoveryReady ? (
            <div className="space-y-6">
              <div
                role="alert"
                className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
              >
                This password reset link is invalid
                or has expired.
              </div>

              <Link
                href="/forgot-password"
                className="block w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-center text-base font-semibold text-white"
              >
                Request a new reset email
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <label className="block">
                <span className="text-sm text-slate-300">
                  New password
                </span>

                <input
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-300">
                  Confirm new password
                </span>

                <input
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value,
                    )
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 disabled:opacity-60"
                />
              </label>

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
                className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Updating password...'
                  : 'Update password'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            Back to{' '}
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