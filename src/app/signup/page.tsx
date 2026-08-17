import Link from 'next/link'
import SignupForm from './SignupForm'

type Plan = 'starter' | 'professional' | 'business'

type SignupPageProps = {
  searchParams: Promise<{ next?: string; email?: string; plan?: string }>
}

function safeNext(value?: string) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

function safePlan(value?: string): Plan {
  const plan = value?.trim().toLowerCase()

  if (
    plan === 'professional' ||
    plan === 'business'
  ) {
    return plan
  }

  return 'starter'
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const next = safeNext(params.next)
  const plan = safePlan(params.plan)
  const invitedEmail = params.email?.trim().toLowerCase() ?? ''
  const invitationSignup = /^\/invite\/[0-9a-f-]{36}$/i.test(next) && Boolean(invitedEmail)
  const enterpriseRequested =
    !invitationSignup && params.plan?.trim().toLowerCase() === 'enterprise'

  if (enterpriseRequested) {
    return (
      <div className="min-h-screen bg-[#07111F] text-white">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
          <div className="rounded-[2rem] border border-white/10 bg-[#0C1728]/90 p-10 text-center shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">
              Enterprise
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-white">
              Assisted onboarding required
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Enterprise uses custom capacity and operating limits, so it is not
              activated through self-service signup. Contact Flowtix to configure
              your Enterprise workspace before activation.
            </p>
            <div className="mt-8 grid gap-3">
              <Link
                href="/contact"
                className="rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 font-semibold text-white"
              >
                Contact Flowtix
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-white/10 px-6 py-3 font-semibold text-slate-300 transition hover:bg-white/5"
              >
                Back to pricing
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const loginParams = new URLSearchParams({ next })
  if (invitedEmail) loginParams.set('email', invitedEmail)
  if (!invitationSignup) loginParams.set('plan', plan)

  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="rounded-[2rem] border border-white/10 bg-[#0C1728]/90 p-10 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">{invitationSignup ? 'Workspace invitation' : 'Create account'}</p>
            <h1 className="mt-4 text-3xl font-semibold text-white">{invitationSignup ? 'Create your Flowtix account' : 'Join Flowtix'}</h1>
            {invitationSignup ? (
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Create an account with the invited email below. You will return
                to the invitation after confirmation.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Start your selected Flowtix plan free for 7 days. No payment is
                taken today. Add payment before the trial ends to keep the
                workspace active.
              </p>
            )}
          </div>
          <SignupForm
            next={next}
            plan={plan}
            invitedEmail={invitedEmail}
            invitationSignup={invitationSignup}
          />

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link href={`/login?${loginParams.toString()}`} className="text-white underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}