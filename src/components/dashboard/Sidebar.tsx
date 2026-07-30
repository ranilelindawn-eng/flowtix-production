'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { Permission } from '@/lib/permissions'
import { hasPermission } from '@/lib/permissions'
import type { TeamRole } from '@/lib/team'
import {
  Briefcase,
  BadgeDollarSign,
  Building2,
  ShieldCheck,
  LockKeyhole,
  FolderOpen,
  GitBranch,
  Mail,
  MessageSquareText,
  BarChart3,
  Tags,
  TextQuote,
  Activity,
  CalendarDays,
  Clock3,
  ListOrdered,
  UsersRound,
  FileText,
  Home,
  Phone,
  Settings,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'

type NavItem = {
  id: string
  label: string
  href: string
  icon: typeof Home
  exact?: boolean
  permission?: Permission
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
    permission: 'contacts.view',
    icon: Building2,
  },
  {
    id: 'pipelines',
    label: 'Pipelines',
    href: '/dashboard/pipelines',
    permission: 'contacts.view',
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
    label: 'Sequences',
    href: '/dashboard/sequences',
    permission: 'campaigns.view',
    icon: ListOrdered,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: '/dashboard/calendar',
    permission: 'contacts.view',
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
    permission: 'campaigns.view',
    icon: Tags,
  },
  {
    id: 'files',
    label: 'Files',
    href: '/dashboard/files',
    permission: 'recordings.view',
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
    label: 'Dialer',
    href: '/dashboard/dialer',
    permission: 'calls.view',
    icon: Zap,
  },
  {
    id: 'live-calls',
    label: 'Live Calls',
    href: '/dashboard/live-calls',
    permission: 'calls.view',
    icon: Activity,
  },
  {
    id: 'ring-groups',
    label: 'Ring Groups',
    href: '/dashboard/ring-groups',
    permission: 'calls.view',
    icon: UsersRound,
  },
  {
    id: 'queues',
    label: 'Queues',
    href: '/dashboard/queues',
    permission: 'calls.view',
    icon: ListOrdered,
  },
  {
    id: 'recordings',
    label: 'Recordings',
    href: '/dashboard/recordings',
    permission: 'recordings.view',
    icon: FileText,
  },
  {
    id: 'transcripts',
    label: 'Transcripts',
    href: '/dashboard/transcripts',
    permission: 'transcripts.view',
    icon: Briefcase,
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/dashboard/reports',
    permission: 'reports.view',
    icon: BarChart3,
  },
  {
    id: 'ai-workspace',
    label: 'AI Workspace',
    href: '/dashboard/ai',
    permission: 'summaries.view',
    icon: Sparkles,
  },
  {
    id: 'insights',
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
    label: 'Time & Attendance',
    href: '/dashboard/attendance',
    permission: 'attendance.view_own',
    icon: Clock3,
  },
  {
    id: 'roles',
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
    permission: 'settings.view',
    icon: LockKeyhole,
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
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname() ?? '/dashboard'

  const visibleNavItems = navItems.filter(
    (item) => !item.permission || hasPermission(role, item.permission),
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

  return (
    <aside className="h-full overflow-y-auto overscroll-contain border-r border-white/10 bg-[#0B1726] text-white [scrollbar-gutter:stable]">
      <div className="mx-auto flex max-w-7xl flex-col px-6 py-6 lg:px-8 lg:py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#22D3EE]/20 to-[#2563EB]/15 text-white ring-1 ring-white/10">
            <span className="text-lg font-semibold">C</span>
          </div>

          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-slate-400">
              CallFlow
            </p>

            <p className="text-lg font-semibold text-white">
              Workspace
            </p>
          </div>
        </div>

        <div className="hidden lg:block">
          <nav className="space-y-1" aria-label="Dashboard navigation">
            {visibleNavItems.map((item) => {
              const isActive = isItemActive(item)

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? 'flex items-center gap-3 rounded-3xl bg-white/5 px-4 py-3 text-white shadow-[0_12px_35px_-20px_rgba(34,211,238,0.55)]'
                      : 'flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-300 transition hover:bg-white/5 hover:text-white'
                  }
                >
                  <item.icon className="h-5 w-5" />

                  <span className="text-sm font-medium">
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="lg:hidden">
          <details className="rounded-3xl border border-white/10 bg-[#07111F]/70 p-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-white">
              Menu
            </summary>

            <nav
              className="mt-4 space-y-2"
              aria-label="Mobile dashboard navigation"
            >
              {visibleNavItems.map((item) => {
                const isActive = isItemActive(item)

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={
                      isActive
                        ? 'flex items-center gap-3 rounded-3xl bg-white/5 px-4 py-3 text-white'
                        : 'flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-300 transition hover:bg-white/5 hover:text-white'
                    }
                  >
                    <item.icon className="h-5 w-5" />

                    <span className="text-sm font-medium">
                      {item.label}
                    </span>
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