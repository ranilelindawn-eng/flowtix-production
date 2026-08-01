import Link from 'next/link'
import { signUp } from '../auth/actions'

type Plan = 'starter' | 'professional' | 'business' | 'enterprise'

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
    plan === 'business' ||
    plan === 'enterprise'
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
            {invitationSignup ? <p className="mt-3 text-sm leading-6 text-slate-400">Create an account with the invited email below. You will return to the invitation after confirmation.</p> : null}
          </div>
          <form action={signUp} className="space-y-6">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="plan" value={plan} />
            <input type="hidden" name="invited_email" value={invitedEmail} />
            <label className="block">
              <span className="text-sm text-slate-300">Email</span>
              <input name="email" type="email" required defaultValue={invitedEmail} readOnly={invitationSignup} autoComplete="email" className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70 read-only:cursor-not-allowed read-only:opacity-80" />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Password</span>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70" />
            </label>
            <button type="submit" className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5">Sign up</button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link href={`/login?${loginParams.toString()}`} className="text-white underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}