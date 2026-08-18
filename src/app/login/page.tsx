import Link from 'next/link'
import LoginForm from './LoginForm'

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
    <div className="flowtix-auth-page min-h-screen bg-transparent text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="flowtix-auth-card rounded-[2rem] p-10 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.28em] text-violet-300">
              Sign in
            </p>

            <h1 className="mt-4 text-3xl font-semibold text-white">
              Welcome back to Flowtix
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
                Your new password is ready. You can now sign in to Flowtix.
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
                Check your inbox, confirm your Flowtix account, then sign in to accept the invitation.
              </p>
            </div>
          )}

          <LoginForm next={next} prefilledEmail={prefilledEmail} />

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
              className="text-violet-300 underline"
            >
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}