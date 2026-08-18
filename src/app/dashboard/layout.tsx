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
import { redirect } from 'next/navigation'

import Sidebar from '@/components/dashboard/Sidebar'
import { OrganizationTimezoneProvider } from '@/components/timezone/OrganizationTimezoneProvider'
import TopNav from '@/components/dashboard/TopNav'
import GuideHelpButton from '@/components/guide/GuideHelpButton'
import SessionTracker from '@/components/security/SessionTracker'
import { getCurrentEntitlements } from '@/lib/entitlements'
import { getCurrentPlatformMembership } from '@/lib/platform/auth'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrganization, getCurrentOrganizationTimezone } from '@/lib/team'

type DashboardLayoutProps = {
  children: ReactNode
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  const claims = claimsData?.claims
  const userId = claims?.sub

  if (
    claimsError ||
    typeof userId !== 'string' ||
    userId.length === 0
  ) {
    redirect('/login')
  }

  const platformMembership =
    await getCurrentPlatformMembership()

  if (platformMembership) {
    redirect('/platform')
  }

  const claimEmail =
    typeof claims?.email === 'string'
      ? claims.email
      : ''

  const [profileResult, currentOrganization, entitlementSnapshot, organizationTimeZone] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .maybeSingle(),
      getCurrentOrganization(),
      getCurrentEntitlements(),
      getCurrentOrganizationTimezone(),
    ])

  const {
    data: profile,
    error: profileError,
  } = profileResult

  if (profileError) {
    console.error(
      'Unable to load dashboard profile:',
      profileError,
    )
  }

  let organizationName = 'Workspace'
  let organizationLogoUrl: string | null = null

  if (currentOrganization) {
    const {
      data: organization,
      error: organizationError,
    } = await supabase
      .from('organizations')
      .select('name, logo_url')
      .eq(
        'id',
        currentOrganization.organization_id,
      )
      .maybeSingle()

    if (organizationError) {
      console.error(
        'Unable to load dashboard organization:',
        organizationError,
      )
    }

    if (organization?.name?.trim()) {
      organizationName =
        organization.name.trim()
    }

    if (organization?.logo_url?.trim()) {
      organizationLogoUrl =
        organization.logo_url.trim()
    }
  }

  const userEmail =
    claimEmail || 'user@example.com'

  const userName =
    profile?.full_name?.trim() ||
    userEmail.split('@')[0] ||
    'User'

  return (
    <div className="flowtix-dashboard-shell min-h-screen bg-transparent text-white">
      <SessionTracker />
      <GuideHelpButton />

      <div className="lg:fixed lg:inset-y-0 lg:left-0 lg:w-[280px]">
        <Sidebar
          role={
            currentOrganization?.role ?? 'agent'
          }
          organizationName={organizationName}
          organizationLogoUrl={
            organizationLogoUrl
          }
          entitlements={entitlementSnapshot?.entitlements ?? []}
        />
      </div>

      <div className="lg:pl-[280px]">
        <div className="border-b border-white/[0.06] bg-[#070A18]/60 py-4 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8">
            <div className="text-sm text-slate-400">
              Flowtix Dashboard
            </div>

            <div className="hidden items-center gap-4 text-slate-400 sm:flex">
              <span>Signed in as</span>

              <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-white/85">
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
            avatarUrl={
              profile?.avatar_url ?? null
            }
          />

          <OrganizationTimezoneProvider timeZone={organizationTimeZone}>
            <div className="mt-10">
              {children}
            </div>
          </OrganizationTimezoneProvider>
        </main>
      </div>
    </div>
  )
}