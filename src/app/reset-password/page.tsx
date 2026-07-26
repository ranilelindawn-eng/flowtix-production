'use client'

import Link from 'next/link'
import { updatePassword } from '../auth/actions'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <div className="rounded-[2rem] border border-white/10 bg-[#0C1728]/90 p-10 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.55)]">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.28em] text-[#22D3EE]">Reset password</p>
            <h1 className="mt-4 text-3xl font-semibold text-white">Set a new password</h1>
          </div>
          <form action={updatePassword} className="space-y-6">
            <label className="block">
              <span className="text-sm text-slate-300">New password</span>
              <input
                name="password"
                type="password"
                required
                className="mt-2 w-full rounded-3xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none transition focus:border-[#22D3EE]/70"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#22D3EE]/25 transition hover:-translate-y-0.5"
            >
              Update password
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-400">
            Back to{' '}
            <Link href="/login" className="text-[#22D3EE] underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
