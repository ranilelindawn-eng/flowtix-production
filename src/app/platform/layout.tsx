export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import PlatformSidebar from '@/components/platform/PlatformSidebar'
import PlatformTopNav from '@/components/platform/PlatformTopNav'
import { requirePlatformAccess } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const membership = await requirePlatformAccess()
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const email = typeof claimsData?.claims?.email === 'string'
    ? claimsData.claims.email
    : 'platform-user@flowtix.work'

  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <div className="lg:fixed lg:inset-y-0 lg:left-0 lg:w-[280px]">
        <PlatformSidebar role={membership.role} />
      </div>
      <div className="lg:pl-[280px]">
        <PlatformTopNav email={email} />
        <main className="mx-auto w-full max-w-[1800px] px-6 py-8 lg:px-8 xl:px-10">{children}</main>
      </div>
    </div>
  )
}
