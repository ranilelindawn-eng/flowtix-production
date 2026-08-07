'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Bot,
  Building2,
  CreditCard,
  Flag,
  Gauge,
  Headphones,
  ListChecks,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { hasPlatformPermission } from '@/lib/platform/permissions'
import type {
  PlatformPermission,
  PlatformRole,
} from '@/lib/platform/types'

type Item = {
  label: string
  href: string
  icon: typeof Gauge
  permission: PlatformPermission
  disabled?: boolean
}

const items: Item[] = [
  { label: 'Platform Dashboard', href: '/platform', icon: Gauge, permission: 'platform.dashboard.view' },
  { label: 'Customers', href: '/platform/customers', icon: Users, permission: 'platform.customers.view', disabled: true },
  { label: 'Organizations', href: '/platform/organizations', icon: Building2, permission: 'platform.organizations.manage', disabled: true },
  { label: 'Subscriptions', href: '/platform/subscriptions', icon: CreditCard, permission: 'platform.subscriptions.manage', disabled: true },
  { label: 'Billing & PayMongo', href: '/platform/billing', icon: CreditCard, permission: 'platform.billing.view', disabled: true },
  { label: 'Telephony Providers', href: '/platform/telephony', icon: Radio, permission: 'platform.telephony.manage', disabled: true },
  { label: 'AI Providers', href: '/platform/ai', icon: Bot, permission: 'platform.ai.manage', disabled: true },
  { label: 'Support Access', href: '/platform/support', icon: Headphones, permission: 'platform.impersonation.use', disabled: true },
  { label: 'Audit Logs', href: '/platform/audit', icon: ScrollText, permission: 'platform.audit.view', disabled: true },
  { label: 'System Health', href: '/platform/health', icon: Activity, permission: 'platform.jobs.view', disabled: true },
  { label: 'Background Jobs', href: '/platform/jobs', icon: ListChecks, permission: 'platform.jobs.view', disabled: true },
  { label: 'Feature Flags', href: '/platform/feature-flags', icon: Flag, permission: 'platform.flags.manage', disabled: true },
  { label: 'Platform Settings', href: '/platform/settings', icon: Settings, permission: 'platform.settings.manage', disabled: true },
]

export default function PlatformSidebar({ role }: { role: PlatformRole }) {
  const pathname = usePathname()
  const visibleItems = items.filter((item) =>
    hasPlatformPermission(role, item.permission),
  )

  return (
    <aside className="flex h-full flex-col border-r border-white/10 bg-[#050D18] px-4 py-6">
      <div className="flex items-center gap-3 px-3">
        <div className="rounded-xl bg-blue-500/15 p-2 text-blue-300">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold text-white">Flowtix Platform</p>
          <p className="text-xs text-slate-500">Internal administration</p>
        </div>
      </div>

      <nav className="mt-8 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = item.href === '/platform'
            ? pathname === item.href
            : pathname.startsWith(item.href)
          const Icon = item.icon

          if (item.disabled) {
            return (
              <div key={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600" title="Available in a later Platform Admin phase">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider">Soon</span>
              </div>
            )
          }

          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-blue-500/15 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-xs uppercase tracking-wider text-slate-500">Platform role</p>
        <p className="mt-1 text-sm font-medium capitalize text-slate-200">{role.replaceAll('_', ' ')}</p>
      </div>
    </aside>
  )
}
