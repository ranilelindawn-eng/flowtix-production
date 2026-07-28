import Link from 'next/link'
import { signIn } from '../auth/actions'

type LoginPageProps = {
  searchParams: Promise<{
    reset?: string
    password?: string
    error?: string
    next?: string
    invite?: string
    email?: string
  }>
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams

  const prefilledEmail = params.email?.trim().toLowerCase() ?? ''
  const resetEmailSent = params.reset === 'sent'
  const passwordUpdated = params.password === 'updated'
  const invitationConfirmationRequired =
    params.invite === 'confirmation-required'
  const next =
    params.next &&
    params.next.startsWith('/') &&
    !params.next.startsWith('//')
      ? params.next
      : '/dashboard'

  const callbackError =
    params.error === 'missing-auth-code'
      ? 'The authentication link is invalid or incomplete. Please request a new password reset email.'
      : params.error === 'auth-callback-failed'
        ? 'The authentication link has expired or could not be verified. Please request a new password reset email.'
        : null

  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="rounded-[2rem] border border-white/10 bg-[#0C1728]/90 p-10 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">
              Sign in
            </p>

            <h1 className="mt-4 text-3xl font-semibold text-white">
              Welcome back to CallFlow
            </h1>
          </div>

          {resetEmailSent && (
            <div
              role="status"
              className="mb-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100"
            >
              <p className="font-semibold text-cyan-300">
                Password reset email sent
              </p>

              <p className="mt-1 text-cyan-100/90">
                Check your inbox and spam folder. Click the link in the email
                to create a new password.
              </p>
            </div>
          )}

          {passwordUpdated && (
            <div
              role="status"
              className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-4 text-sm leading-6 text-emerald-100"
            >
              <p className="font-semibold text-emerald-300">
                Password updated successfully
              </p>

              <p className="mt-1 text-emerald-100/90">
                Your new password is ready. You can now sign in to CallFlow.
              </p>
            </div>
          )}

          {callbackError && (
            <div
              role="alert"
              className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-4 text-sm leading-6 text-red-100"
            >
              <p className="font-semibold text-red-300">
                Authentication link error
              </p>

              <p className="mt-1 text-red-100/90">{callbackError}</p>

              <Link
                href="/forgot-password"
                className="mt-3 inline-block font-semibold text-red-200 underline underline-offset-4"
              >
                Request another reset email
              </Link>
            </div>
          )}

          {invitationConfirmationRequired && (
            <div
              role="status"
              className="mb-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100"
            >
              <p className="font-semibold text-cyan-300">
                Confirm your email to continue
              </p>
              <p className="mt-1 text-cyan-100/90">
                Check your inbox, confirm your CallFlow account, then sign in to accept the invitation.
              </p>
            </div>
          )}

          <form action={signIn} className="space-y-6">
            <input type="hidden" name="next" value={next} />
            <label className="block">
              <span className="text-sm text-slate-300">Email</span>

              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={prefilledEmail}
                className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-300">Password</span>

              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5"
            >
              Login
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Don’t have an account?{' '}
            <Link
              href={`/signup?${new URLSearchParams({ next, ...(prefilledEmail ? { email: prefilledEmail } : {}) }).toString()}`}
              className="text-white underline"
            >
              Create one
            </Link>
          </p>

          <p className="mt-2 text-center text-sm text-slate-400">
            <Link
              href="/forgot-password"
              className="text-[#22D3EE] underline"
            >
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}