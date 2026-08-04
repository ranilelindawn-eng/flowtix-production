'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CreditCard,
  KeyRound,
  ListChecks,
  Workflow,
  Plug,
  Shield,
  Smartphone,
  UserRound,
  UsersRound,
} from 'lucide-react'

import { hasPermission } from '@/lib/permissions'
import type { TeamRole } from '@/lib/team'

const links = [
  {
    href: '/dashboard/settings/profile',
    label: 'Profile',
    icon: UserRound,
  },
  {
    href: '/dashboard/settings/organization',
    label: 'Organization',
    icon: Building2,
  },
  {
    href: '/dashboard/settings/team',
    label: 'Team',
    icon: UsersRound,
  },
  {
    href: '/dashboard/settings/api-keys',
    label: 'API Keys',
    icon: KeyRound,
  },
  {
    href: '/dashboard/settings/billing',
    label: 'Billing',
    icon: CreditCard,
  },
  {
    href: '/dashboard/settings/integrations',
    label: 'Integrations',
    icon: Plug,
  },
  {
    href: '/dashboard/settings/phone-numbers',
    label: 'Phone Numbers',
    icon: Smartphone,
  },
  {
    href: '/dashboard/settings/security',
    label: 'Security',
    icon: Shield,
  },
  {
    href: '/dashboard/settings/automation',
    label: 'Automation',
    icon: Workflow,
    permission: 'automation.view' as const,
  },
  {
    href: '/dashboard/settings/jobs',
    label: 'Background Jobs',
    icon: ListChecks,
    permission: 'jobs.view' as const,
  },
]

export function SettingsNav({ role }: { role: TeamRole }) {
  const pathname = usePathname()
  const visibleLinks = links.filter(
    (link) => !link.permission || hasPermission(role, link.permission),
  )

  return (
    <nav className="space-y-1">
      {visibleLinks.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
