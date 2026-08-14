import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Checkout Complete',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function CheckoutSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07111F] px-6 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#0C1728]/90 p-10 text-center shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-2xl text-emerald-300">
          ✓
        </div>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Checkout complete
        </p>

        <h1 className="mt-4 text-3xl font-semibold">
          Your 7-day Flowtix trial is ready.
        </h1>

        <p className="mt-4 leading-7 text-slate-400">
          PayMongo has securely processed your checkout. Check your email for
          the Supabase confirmation message, confirm your account if required,
          and then sign in to Flowtix.
        </p>

        <Link
          href="/login"
          className="mt-8 inline-flex rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-7 py-3 font-semibold text-white"
        >
          Continue to sign in
        </Link>
      </section>
    </main>
  )
}
