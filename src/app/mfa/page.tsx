import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import MfaAccessGate from '@/components/security/MfaAccessGate'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Verify identity | Flowtix',
  robots: { index: false, follow: false, nocache: true },
}

type MfaPageProps = {
  searchParams: Promise<{ next?: string }>
}

export default async function MfaPage({ searchParams }: MfaPageProps) {
  const supabase = await createClient()
  const { data: claimsData, error } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (error || typeof userId !== 'string' || !userId) {
    redirect('/login')
  }

  const params = await searchParams
  const requestedNext = params.next?.trim() ?? ''
  const nextPath =
    requestedNext.startsWith('/dashboard') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/dashboard'

  if (claimsData?.claims?.aal === 'aal2') {
    redirect(nextPath)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070A18] px-6 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <p className="text-sm uppercase tracking-[.28em] text-cyan-300">Security check</p>
        <h1 className="mt-3 text-3xl font-semibold">Verify your identity</h1>
        <div className="mt-6">
          <MfaAccessGate nextPath={nextPath} />
        </div>
      </section>
    </main>
  )
}
