export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import Sidebar from '@/components/dashboard/Sidebar'
import TopNav from '@/components/dashboard/TopNav'
import SessionTracker from '@/components/security/SessionTracker'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization } from '@/lib/team'

type DashboardLayoutProps = {
  children: ReactNode
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  const userId = claimsData?.claims?.sub

  if (
    claimsError ||
    typeof userId !== 'string' ||
    userId.length === 0
  ) {
    redirect('/login')
  }

  const claims = claimsData?.claims
  const claimEmail =
    typeof claims?.email === 'string' ? claims.email : ''

  const [profileResult, currentOrganization] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    getCurrentOrganization(),
  ])

  const { data: profile, error: profileError } = profileResult

  if (profileError) {
    console.error(
      'Unable to load dashboard profile:',
      profileError,
    )
  }

  let organizationName = 'Workspace'

  if (currentOrganization) {
    const { data: organization, error: organizationError } =
      await supabase
        .from('organizations')
        .select('name')
        .eq('id', currentOrganization.organization_id)
        .maybeSingle()

    if (organizationError) {
      console.error(
        'Unable to load dashboard organization:',
        organizationError,
      )
    }

    if (organization?.name) {
      organizationName = organization.name
    }
  }

  const userEmail = claimEmail || 'user@example.com'
  const userName =
    profile?.full_name?.trim() ||
    userEmail.split('@')[0] ||
    'User'

  return (
    <div className="min-h-screen bg-[#07111F] text-white">
      <SessionTracker />
      <div className="lg:fixed lg:inset-y-0 lg:left-0 lg:w-[280px]">
        <Sidebar role={currentOrganization?.role ?? 'agent'} />
      </div>

      <div className="lg:pl-[280px]">
        <div className="border-b border-white/10 bg-[#07111F]/90 py-5 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8">
            <div className="text-sm text-slate-400">
              CallFlow Dashboard
            </div>

            <div className="hidden items-center gap-4 text-slate-400 sm:flex">
              <span>Signed in as</span>

              <span className="rounded-full bg-white/5 px-3 py-2 text-white">
                {userEmail}
              </span>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <TopNav
            organizationName={organizationName}
            userName={userName}
            userEmail={userEmail}
            avatarUrl={profile?.avatar_url ?? null}
          />

          <div className="mt-10">{children}</div>
        </main>
      </div>
    </div>
  )
}
