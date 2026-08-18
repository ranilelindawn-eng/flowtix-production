'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  BookOpenText,
  Briefcase,
  BrainCircuit,
  Building2,
  CalendarDays,
  Clock3,
  FileText,
  FolderOpen,
  GitBranch,
  Home,
  ListOrdered,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Phone,
  PhoneCall,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  TextQuote,
  Users,
  UserRoundCheck,
  Zap,
} from 'lucide-react'

import type { FeatureEntitlement } from '@/lib/entitlements'
import type { Permission } from '@/lib/permissions'
import { hasPermission } from '@/lib/permissions'
import { getMinimumPlanForFeature } from '@/lib/plans/catalog'
import type { TeamRole } from '@/lib/team'

type NavItem = {
  id: string
  label: string
  href: string
  icon: typeof Home
  exact?: boolean
  permission?: Permission
  feature?: FeatureEntitlement
  ownerOnly?: boolean
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    exact: true,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/dashboard/contacts',
    permission: 'contacts.view',
    icon: Users,
  },
  {
    id: 'companies',
    label: 'Companies',
    href: '/dashboard/companies',
    permission: 'companies.view',
    icon: Building2,
  },
  {
    id: 'pipelines',
    label: 'Pipelines',
    href: '/dashboard/pipelines',
    permission: 'opportunities.view',
    icon: GitBranch,
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    href: '/dashboard/campaigns',
    permission: 'campaigns.view',
    icon: Sparkles,
  },
  {
    id: 'sequences',
    feature: 'automation.sequences',
    label: 'Sequences',
    href: '/dashboard/sequences',
    permission: 'campaigns.view',
    icon: ListOrdered,
  },
  {
    id: 'activities',
    label: 'Activities',
    href: '/dashboard/activities',
    permission: 'contacts.view',
    icon: Activity,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    href: '/dashboard/timeline',
    permission: 'contacts.view',
    icon: Clock3,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: '/dashboard/calendar',
    permission: 'calendar.view',
    icon: CalendarDays,
  },
  {
    id: 'communications',
    label: 'Email & SMS',
    href: '/dashboard/communications',
    permission: 'campaigns.view',
    icon: Mail,
  },
  {
    id: 'templates',
    label: 'Templates',
    href: '/dashboard/templates',
    permission: 'campaigns.view',
    icon: MessageSquareText,
  },
  {
    id: 'snippets',
    label: 'Snippets',
    href: '/dashboard/snippets',
    permission: 'campaigns.view',
    icon: TextQuote,
  },
  {
    id: 'tags',
    label: 'Tags',
    href: '/dashboard/tags',
    permission: 'contacts.view',
    icon: Tags,
  },
  {
    id: 'files',
    label: 'Files',
    href: '/dashboard/files',
    permission: 'contacts.view',
    icon: FolderOpen,
  },
  {
    id: 'calls',
    label: 'Calls',
    href: '/dashboard/calls',
    permission: 'calls.view',
    icon: Phone,
  },
  {
    id: 'dialer',
    feature: 'dialer.cloud',
    label: 'Dialer',
    href: '/dashboard/dialer',
    permission: 'calls.create',
    icon: Zap,
  },
  {
    id: 'live-calls',
    feature: 'dialer.cloud',
    label: 'Live Calls',
    href: '/dashboard/live-calls',
    permission: 'calls.view',
    icon: Activity,
  },
  {
    id: 'recordings',
    feature: 'dialer.cloud',
    label: 'Recordings',
    href: '/dashboard/recordings',
    permission: 'recordings.view',
    icon: FileText,
  },
  {
    id: 'transcripts',
    feature: 'ai.transcription',
    label: 'Transcripts',
    href: '/dashboard/transcripts',
    permission: 'transcripts.view',
    icon: Briefcase,
  },
  {
    id: 'dashboards',
    feature: 'analytics.dashboards',
    label: 'Dashboards',
    href: '/dashboard/dashboards',
    permission: 'reports.view',
    icon: LayoutDashboard,
  },
  {
    id: 'exports',
    feature: 'reports.export',
    label: 'Data Exports',
    href: '/dashboard/exports',
    permission: 'reports.export',
    ownerOnly: true,
    icon: FolderOpen,
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/dashboard/reports',
    permission: 'reports.view',
    icon: BarChart3,
  },
  {
    id: 'kpis',
    feature: 'analytics.kpi',
    label: 'KPI Engine',
    href: '/dashboard/kpis',
    permission: 'reports.view',
    icon: Target,
  },
  {
    id: 'sales-analytics',
    feature: 'analytics.sales',
    label: 'Sales Analytics',
    href: '/dashboard/sales-analytics',
    permission: 'reports.view',
    icon: BadgeDollarSign,
  },
  {
    id: 'call-analytics',
    feature: 'analytics.calls',
    label: 'Call Analytics',
    href: '/dashboard/call-analytics',
    permission: 'reports.view',
    icon: PhoneCall,
  },
  {
    id: 'agent-analytics',
    feature: 'analytics.agents',
    label: 'Agent Analytics',
    href: '/dashboard/agent-analytics',
    permission: 'reports.view',
    icon: UserRoundCheck,
  },
  {
    id: 'campaign-analytics',
    feature: 'analytics.campaigns',
    label: 'Campaign Analytics',
    href: '/dashboard/campaign-analytics',
    permission: 'reports.view',
    icon: Sparkles,
  },
  {
    id: 'ai-analytics',
    feature: 'analytics.ai',
    label: 'AI Analytics',
    href: '/dashboard/ai-analytics',
    permission: 'reports.view',
    icon: BrainCircuit,
  },
  {
    id: 'ai-workspace',
    feature: 'ai.chat',
    label: 'AI Workspace',
    href: '/dashboard/ai',
    permission: 'summaries.view',
    icon: Sparkles,
  },
  {
    id: 'insights',
    feature: 'ai.insights',
    label: 'AI Insights',
    href: '/dashboard/insights',
    permission: 'insights.view',
    icon: Sparkles,
  },
  {
    id: 'organization',
    label: 'Organization',
    href: '/dashboard/organization',
    permission: 'organization.view',
    icon: Building2,
  },
  {
    id: 'team',
    label: 'Team',
    href: '/dashboard/team',
    permission: 'team.view',
    icon: Users,
  },
  {
    id: 'attendance',
    feature: 'workforce.attendance',
    label: 'Time & Attendance',
    href: '/dashboard/attendance',
    permission: 'attendance.view_own',
    icon: Clock3,
  },
  {
    id: 'roles',
    feature: 'team.advanced',
    label: 'Roles & Permissions',
    href: '/dashboard/roles',
    permission: 'team.update_roles',
    icon: ShieldCheck,
  },
  {
    id: 'billing',
    label: 'Billing',
    href: '/dashboard/billing',
    permission: 'billing.view',
    icon: BadgeDollarSign,
  },
  {
    id: 'security-center',
    label: 'Security Center',
    href: '/dashboard/security',
    permission: 'settings.manage',
    icon: LockKeyhole,
  },
  {
    id: 'guide',
    label: 'Guide',
    href: '/dashboard/guide',
    icon: BookOpenText,
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/dashboard/settings',
    permission: 'settings.view',
    icon: Settings,
  },
]

type SidebarProps = {
  role: TeamRole
  organizationName: string
  organizationLogoUrl: string | null
  entitlements: readonly FeatureEntitlement[]
}

function getOrganizationInitial(name: string): string {
  const firstCharacter = name.trim().charAt(0)

  return firstCharacter ? firstCharacter.toUpperCase() : 'W'
}

function getRequiredPlanBadgeLabel(
  planName: string,
): string {
  switch (planName) {
    case 'Professional':
      return 'PRO'
    case 'Business':
      return 'BUS'
    case 'Enterprise':
      return 'ENT'
    default:
      return planName.toUpperCase()
  }
}

export default function Sidebar({
  role,
  organizationName,
  organizationLogoUrl,
  entitlements,
}: SidebarProps) {
  const pathname = usePathname() ?? '/dashboard'

  const authorizedNavItems = navItems.filter(
    (item) =>
      (!item.permission || hasPermission(role, item.permission)) &&
      (!item.ownerOnly || role === 'owner'),
  )

  function isItemActive(item: NavItem): boolean {
    if (item.exact) {
      return pathname === item.href
    }

    return (
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`)
    )
  }

  const organizationInitial =
    getOrganizationInitial(organizationName)

  return (
    <aside className="h-full overflow-y-auto overscroll-contain border-r border-white/[0.06] bg-[#070A18]/82 backdrop-blur-2xl text-white [scrollbar-gutter:stable]">
      <div className="mx-auto flex max-w-7xl flex-col px-6 py-6 lg:px-8 lg:py-8">
        <Link
          href="/dashboard/settings/organization"
          className="mb-8 flex items-center gap-3 rounded-2xl transition hover:opacity-90"
          aria-label="Open organization settings"
        >
          <div className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#4F8BFF]/25 to-[#C05CFF]/20 text-white ring-1 ring-white/10">
            {organizationLogoUrl ? (
              <Image
                src={organizationLogoUrl}
                alt={`${organizationName} logo`}
                fill
                unoptimized
                sizes="44px"
                className="object-cover"
              />
            ) : (
              <span className="text-lg font-semibold">
                {organizationInitial}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.32em] text-white/40">
              Flowtix
            </p>

            <p
              className="truncate text-lg font-semibold text-white"
              title={organizationName}
            >
              {organizationName}
            </p>
          </div>
        </Link>

        <div className="hidden lg:block">
          <nav
            className="space-y-1"
            aria-label="Dashboard navigation"
          >
            {authorizedNavItems.map((item) => {
              const isActive = isItemActive(item)
              const isLocked = Boolean(
                item.feature &&
                  !entitlements.includes(item.feature),
              )
              const requiredPlan = item.feature
                ? getMinimumPlanForFeature(item.feature)
                : null

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={
                    isActive ? 'page' : undefined
                  }
                  aria-label={
                    isLocked && requiredPlan
                      ? `${item.label} — ${requiredPlan.name} plan required`
                      : undefined
                  }
                  className={
                    isActive
                      ? 'flex items-center gap-3 rounded-3xl border border-[#7B5CFF]/20 bg-gradient-to-r from-[#4F8BFF]/10 to-[#8B5CF6]/10 px-4 py-3 text-white shadow-[0_12px_35px_-20px_rgba(123,92,255,0.7)]'
                      : isLocked
                        ? 'flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-400 transition hover:bg-white/5 hover:text-slate-200'
                        : 'flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-300 transition hover:bg-white/5 hover:text-white'
                  }
                >
                  <item.icon
                    className={
                      isLocked
                        ? 'h-5 w-5 opacity-70'
                        : 'h-5 w-5'
                    }
                  />

                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.label}
                  </span>

                  {isLocked && requiredPlan ? (
                    <span
                      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200"
                      title={`${requiredPlan.name} plan required`}
                    >
                      <LockKeyhole
                        className="h-3 w-3"
                        aria-hidden="true"
                      />
                      {getRequiredPlanBadgeLabel(
                        requiredPlan.name,
                      )}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="lg:hidden">
          <details className="rounded-3xl border border-white/10 bg-[#0B0F22]/70 p-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-white">
              Menu
            </summary>

            <nav
              className="mt-4 space-y-2"
              aria-label="Mobile dashboard navigation"
            >
              {authorizedNavItems.map((item) => {
                const isActive = isItemActive(item)
                const isLocked = Boolean(
                  item.feature &&
                    !entitlements.includes(item.feature),
                )
                const requiredPlan = item.feature
                  ? getMinimumPlanForFeature(item.feature)
                  : null

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={
                      isActive ? 'page' : undefined
                    }
                    aria-label={
                      isLocked && requiredPlan
                        ? `${item.label} — ${requiredPlan.name} plan required`
                        : undefined
                    }
                    className={
                      isActive
                        ? 'flex items-center gap-3 rounded-3xl bg-white/5 px-4 py-3 text-white'
                        : isLocked
                          ? 'flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-400 transition hover:bg-white/5 hover:text-slate-200'
                          : 'flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-300 transition hover:bg-white/5 hover:text-white'
                    }
                  >
                    <item.icon
                      className={
                        isLocked
                          ? 'h-5 w-5 opacity-70'
                          : 'h-5 w-5'
                      }
                    />

                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.label}
                    </span>

                    {isLocked && requiredPlan ? (
                      <span
                        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200"
                        title={`${requiredPlan.name} plan required`}
                      >
                        <LockKeyhole
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {getRequiredPlanBadgeLabel(
                          requiredPlan.name,
                        )}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </nav>
          </details>
        </div>
      </div>
    </aside>
  )
}