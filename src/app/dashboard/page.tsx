import Link from 'next/link'
import type { ReactNode } from 'react'
import StatsCard from '@/components/dashboard/StatsCard'
import DataTable from '@/components/dashboard/DataTable'
import QuickActions from '@/components/dashboard/QuickActions'
import {
  formatCallDurationLabel,
  formatDashboardPercentage,
} from '@/lib/formatters'

import { getDashboardData } from '@/lib/dashboard'
import FollowUpWidget from '@/components/dashboard/FollowUpWidget'
import DashboardLiveRefresh from '@/components/dashboard/DashboardLiveRefresh'

import { getCurrentOrganizationTimezone } from '@/lib/team'
type IconProps = {
  className?: string
}

type UnknownRecord = Record<string, unknown>

function UsersIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      />
      <circle cx="9" cy="7" r="4" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
      />
    </svg>
  )
}

function PhoneIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"
      />
    </svg>
  )
}

function CalendarIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 3v4M8 3v4M3 11h18"
      />
    </svg>
  )
}

function ActivityIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12h4l3-8 4 16 3-8h4"
      />
    </svg>
  )
}

function ClockIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 7v5l3 2"
      />
    </svg>
  )
}

function ChartIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 19V9M10 19V5M16 19v-7M22 19V3"
      />
    </svg>
  )
}

function CampaignIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 11 18-7-7 18-3-8-8-3Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11 14 4-4"
      />
    </svg>
  )
}

function PlusIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v14M5 12h14"
      />
    </svg>
  )
}

function UploadIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0L7 9m5-5 5 5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
      />
    </svg>
  )
}

function UserPlusIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
      />
      <circle cx="8" cy="7" r="4" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 8v6M16 11h6"
      />
    </svg>
  )
}

function MailIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" />
    </svg>
  )
}

function TrophyIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6" />
    </svg>
  )
}

function DollarIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8.5c-.8-1-2-1.5-3.6-1.5-2 0-3.4 1-3.4 2.5 0 3.7 7 1.7 7 5.3 0 1.4-1.4 2.5-3.5 2.5-1.8 0-3.1-.6-4-1.8M12 5v14" />
    </svg>
  )
}

function CheckIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 12 3 3 6-7" />
    </svg>
  )
}

function getGreeting(timeZone: string): string {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'hour')?.value

  const hour = Number(hourPart ?? 0)

  if (hour < 12) {
    return 'Good morning'
  }

  if (hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

function formatDate(value: string | null | undefined, timeZone: string): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatActivityTime(
  value: string | null | undefined,
  timeZone: string,
): string {
  if (!value) {
    return 'Recently'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'CF'
}

function getRecordValue(
  record: UnknownRecord,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key]
    }
  }

  return undefined
}

function getStringValue(
  record: UnknownRecord,
  keys: string[],
  fallback: string,
): string {
  const value = getRecordValue(record, keys)

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  return fallback
}

function getNumberValue(
  record: UnknownRecord,
  keys: string[],
): number {
  const value = getRecordValue(record, keys)

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

function getBarHeight(
  value: number,
  maximum: number,
): number {
  if (maximum <= 0 || value <= 0) {
    return 6
  }

  return Math.max(10, Math.round((value / maximum) * 100))
}

function getOutcomeTone(index: number): string {
  const tones = [
    'bg-cyan-400',
    'bg-emerald-400',
    'bg-violet-400',
    'bg-amber-400',
    'bg-blue-400',
    'bg-rose-400',
  ]

  return tones[index % tones.length]
}

function formatCurrency(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${currencyCode} ${Math.round(value).toLocaleString('en-US')}`
  }
}

function getDashboardDateRange(timeZone: string): string {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - 6)

  const formatter = new Intl.DateTimeFormat('en', {
    timeZone,
    month: 'short',
    day: 'numeric',
  })
  const yearFormatter = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
  })

  return `${formatter.format(start)} – ${formatter.format(end)}, ${yearFormatter.format(end)}`
}

function getChartPoints(values: number[], maximum: number): string {
  if (values.length === 0) return ''

  const width = 640
  const height = 220
  const horizontalPadding = 28
  const topPadding = 24
  const bottomPadding = 34
  const usableWidth = width - horizontalPadding * 2
  const usableHeight = height - topPadding - bottomPadding
  const safeMaximum = Math.max(maximum, 1)

  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : horizontalPadding + (index / (values.length - 1)) * usableWidth
      const y = topPadding + usableHeight - (Math.max(value, 0) / safeMaximum) * usableHeight
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function AnalyticsCard({
  title,
  description,
  children,
  href,
}: {
  title: string
  description: string
  children: ReactNode
  href?: string
}) {
  const content = (
    <section className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)] transition duration-300 group-hover:-translate-y-1 group-hover:border-cyan-400/20 group-hover:bg-[#0E1C2E]">
      <div className="border-b border-white/10 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>

      <div className="p-6">
        {children}
      </div>
    </section>
  )

  if (!href) {
    return content
  }

  return (
    <Link
      href={href}
      aria-label={`Open ${title}`}
      className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      {content}
    </Link>
  )
}

export default async function DashboardPage() {
  const timeZone = await getCurrentOrganizationTimezone()
  const dashboard = await getDashboardData(timeZone)

  const userName = dashboard.userName || 'there'
  const organizationName =
    dashboard.organizationName || 'Your workspace'

  const connectedRate = formatDashboardPercentage(
    dashboard.connectedRate,
  )

  const averageDuration = formatCallDurationLabel(
    dashboard.averageCallDurationSeconds,
  )

  const primaryStats = [
    {
      label: 'Total Contacts',
      value: dashboard.totalContacts,
      delta: 'Live database',
      icon: <UsersIcon />,
      tone: 'violet' as const,
      href: '/dashboard/contacts',
    },
    {
      label: 'Deals in Pipeline',
      value: dashboard.openDeals,
      delta: `${formatCurrency(dashboard.pipelineValue, dashboard.currencyCode)} pipeline`,
      icon: <ChartIcon />,
      tone: 'emerald' as const,
      href: '/dashboard/pipelines',
    },
    {
      label: 'Won Deals',
      value: dashboard.wonDeals,
      delta: 'Closed won',
      icon: <TrophyIcon />,
      tone: 'amber' as const,
      href: '/dashboard/pipelines',
    },
    {
      label: 'Revenue',
      value: formatCurrency(dashboard.wonRevenue, dashboard.currencyCode),
      delta: 'Won revenue',
      icon: <DollarIcon />,
      tone: 'blue' as const,
      href: '/dashboard/sales-analytics',
    },
  ]

  const operationalMetrics = [
    { label: 'Total calls', value: dashboard.totalCalls, href: '/dashboard/calls' },
    { label: 'Calls today', value: dashboard.callsToday, href: '/dashboard/calls' },
    { label: 'Connected rate', value: connectedRate, href: '/dashboard/call-analytics' },
    { label: 'Avg. duration', value: averageDuration, href: '/dashboard/call-analytics' },
    { label: 'Total minutes', value: dashboard.totalCallMinutes, href: '/dashboard/call-analytics' },
    { label: 'Active campaigns', value: dashboard.activeCampaigns, href: '/dashboard/campaigns' },
  ]


  const recentContactRowHrefs = dashboard.recentContacts.map(
    (contact) => `/dashboard/contacts/${contact.id}`,
  )

  const recentContactsRows = dashboard.recentContacts.map(
    (contact) => {
      const fullName =
        `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() ||
        'Unnamed contact'

      return [
        <div
          key={`${contact.id}-name`}
          className="flex items-center gap-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-xs font-semibold text-cyan-200">
            {getInitials(fullName)}
          </div>

          <div>
            <p className="font-medium text-white">
              {fullName}
            </p>
          </div>
        </div>,
        contact.company ?? '—',
        contact.status || 'unknown',
        formatDate(contact.created_at, timeZone),
      ]
    },
  )

  const recentCallRowHrefs = dashboard.recentCalls.map(
    (call) => `/dashboard/calls/${call.id}`,
  )

  const recentCallsRows = dashboard.recentCalls.map((call) => [
    <div
      key={`${call.id}-contact`}
      className="flex items-center gap-3"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-200">
        <PhoneIcon className="h-4 w-4" />
      </div>

      <span className="font-medium text-white">
        {call.contactName}
      </span>
    </div>,
    formatCallDurationLabel(call.durationSeconds),
    call.status || 'unknown',
    formatDate(call.started_at, timeZone),
  ])

  const actions = [
    {
      href: '/dashboard/contacts/new',
      title: 'Create contact',
      description:
        'Add a new customer, prospect, or lead to your workspace.',
      icon: <PlusIcon />,
      badge: 'Popular',
    },
    {
      href: '/dashboard/dialer',
      title: 'Open dialer',
      description:
        'Start calling contacts directly from your Flowtix workspace.',
      icon: <PhoneIcon />,
    },
    {
      href: '/dashboard/campaigns/new',
      title: 'Create campaign',
      description:
        'Build a structured outreach campaign for your sales team.',
      icon: <CampaignIcon />,
    },
    {
      href: '/dashboard/recordings',
      title: 'View recordings',
      description:
        'Review stored call recordings and conversation history.',
      icon: <UploadIcon />,
    },
    {
      href: '/dashboard/team',
      title: 'Manage team',
      description:
        'Invite teammates and manage access to your organization.',
      icon: <UserPlusIcon />,
    },
  ]

  const callsOverTime = dashboard.callsOverTime.map(
    (point, index) => {
      const record = point as unknown as UnknownRecord

      return {
        key: `calls-${index}`,
        label: getStringValue(
          record,
          ['label', 'day', 'dateLabel', 'date'],
          `Day ${index + 1}`,
        ),
        value: getNumberValue(
          record,
          ['count', 'calls', 'total', 'value'],
        ),
      }
    },
  )

  const maximumCalls = Math.max(
    ...callsOverTime.map((point) => point.value),
    0,
  )

  const callOutcomes = dashboard.callOutcomes.map(
    (point, index) => {
      const record = point as unknown as UnknownRecord

      return {
        key: `outcome-${index}`,
        label: getStringValue(
          record,
          ['label', 'status', 'name', 'outcome'],
          'Unknown',
        ),
        value: getNumberValue(
          record,
          ['count', 'total', 'value', 'calls'],
        ),
        percentage: getNumberValue(
          record,
          ['percentage', 'percent', 'rate'],
        ),
      }
    },
  )

  const totalOutcomeCalls = callOutcomes.reduce(
    (total, outcome) => total + outcome.value,
    0,
  )

  const activityItems = dashboard.recentActivity.map(
    (activity, index) => {
      const record = activity as unknown as UnknownRecord

      return {
        key: `activity-${index}`,
        title: getStringValue(
          record,
          ['title', 'label', 'type'],
          'Workspace activity',
        ),
        description: getStringValue(
          record,
          ['description', 'message', 'detail'],
          'A new activity was recorded in your workspace.',
        ),
        href:
          activity.type === 'call'
            ? `/dashboard/calls/${activity.id.replace(/^call-/, '')}`
            : `/dashboard/contacts/${activity.id.replace(/^contact-/, '')}`,
        time: getStringValue(
          record,
          [
            'time',
            'created_at',
            'createdAt',
            'occurred_at',
            'occurredAt',
          ],
          'Recently',
        ),
      }
    },
  )

  const currentRevenueSeries = dashboard.salesTrend.map(
    (point) => point.currentRevenue,
  )
  const previousRevenueSeries = dashboard.salesTrend.map(
    (point) => point.previousRevenue,
  )
  const salesMaximum = Math.max(
    ...currentRevenueSeries,
    ...previousRevenueSeries,
    1,
  )
  const currentSalesPoints = getChartPoints(
    currentRevenueSeries,
    salesMaximum,
  )
  const previousSalesPoints = getChartPoints(
    previousRevenueSeries,
    salesMaximum,
  )
  const thisWeekRevenue = currentRevenueSeries.reduce(
    (total, value) => total + value,
    0,
  )
  const previousWeekRevenue = previousRevenueSeries.reduce(
    (total, value) => total + value,
    0,
  )
  const revenueChange =
    previousWeekRevenue > 0
      ? ((thisWeekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100
      : thisWeekRevenue > 0
        ? 100
        : 0
  const dateRangeLabel = getDashboardDateRange(timeZone)
  const topActivities = [
    {
      label: 'Calls made',
      value: dashboard.callsToday,
      icon: <PhoneIcon className="h-4 w-4" />,
      href: '/dashboard/calls',
      tone: 'text-violet-300',
    },
    {
      label: 'Emails sent',
      value: dashboard.emailsToday,
      icon: <MailIcon className="h-4 w-4" />,
      href: '/dashboard/communications',
      tone: 'text-blue-300',
    },
    {
      label: 'Meetings',
      value: dashboard.meetingsToday,
      icon: <CalendarIcon className="h-4 w-4" />,
      href: '/dashboard/calendar',
      tone: 'text-fuchsia-300',
    },
    {
      label: 'Tasks completed',
      value: dashboard.tasksCompletedToday,
      icon: <CheckIcon className="h-4 w-4" />,
      href: '/dashboard/tasks',
      tone: 'text-emerald-300',
    },
  ]

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
            {organizationName}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {getGreeting(timeZone)}, {userName}! <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="inline-flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#0B1423]/85 px-4 py-2.5 text-xs font-medium text-slate-300">
            {dateRangeLabel}
          </span>
          <DashboardLiveRefresh organizationId={dashboard.organizationId} />
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/dialer"
          className="inline-flex min-h-11 items-center justify-center gap-2 !rounded-xl !border !border-violet-400/40 !bg-violet-600 px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_12px_32px_rgba(124,58,237,0.28)] transition hover:!bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <PhoneIcon className="h-4 w-4" />
          Start calling
        </Link>

        <Link
          href="/dashboard/contacts/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 !rounded-xl !border !border-white/10 !bg-[#121D30] px-5 py-2.5 text-sm font-semibold !text-white transition hover:!border-violet-400/30 hover:!bg-[#17243A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <PlusIcon className="h-4 w-4" />
          New contact
        </Link>
      </section>

      {dashboard.error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {dashboard.error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primaryStats.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            delta={stat.delta}
            icon={stat.icon}
            tone={stat.tone}
            href={stat.href}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1726]/92 shadow-[0_24px_70px_-48px_rgba(79,70,229,0.8)]">
          <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Sales overview</h2>
              <p className="mt-1 text-xs text-slate-400">
                Won revenue this week compared with last week.
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-5 rounded-full bg-violet-400" /> This week
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-px w-5 border-t border-dashed border-slate-500" /> Last week
              </span>
            </div>
          </div>

          <div className="px-5 pb-4 pt-5">
            <div className="mb-1 flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-white">
                  {formatCurrency(thisWeekRevenue, dashboard.currencyCode)}
                </p>
                <p
                  className={`mt-1 text-xs font-semibold ${
                    revenueChange >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {revenueChange >= 0 ? '↗' : '↘'} {Math.abs(revenueChange).toFixed(1)}% vs last week
                </p>
              </div>
              <Link
                href="/dashboard/sales-analytics"
                className="text-xs font-semibold text-violet-300 transition hover:text-violet-200"
              >
                View analytics →
              </Link>
            </div>

            <svg
              viewBox="0 0 640 220"
              className="mt-2 h-[220px] w-full overflow-visible"
              role="img"
              aria-label="Sales revenue for this week and last week"
            >
              <defs>
                <linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(139 92 246)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[50, 90, 130, 170].map((y) => (
                <line
                  key={y}
                  x1="28"
                  y1={y}
                  x2="612"
                  y2={y}
                  stroke="rgba(148,163,184,0.10)"
                  strokeWidth="1"
                />
              ))}
              <polyline
                points={previousSalesPoints}
                fill="none"
                stroke="rgb(100 116 139)"
                strokeOpacity="0.55"
                strokeWidth="2"
                strokeDasharray="6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={currentSalesPoints}
                fill="none"
                stroke="rgb(139 92 246)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {dashboard.salesTrend.map((point, index) => {
                const x = 28 + (index / 6) * 584
                return (
                  <text
                    key={`${point.label}-${index}`}
                    x={x}
                    y="214"
                    textAnchor="middle"
                    fill="rgb(100 116 139)"
                    fontSize="11"
                  >
                    {point.label}
                  </text>
                )
              })}
            </svg>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1726]/92 shadow-[0_24px_70px_-48px_rgba(79,70,229,0.8)]">
          <div className="border-b border-white/[0.08] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Top activities</h2>
                <p className="mt-1 text-xs text-slate-400">Today&apos;s organization activity.</p>
              </div>
              <span className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-400">
                Today
              </span>
            </div>
          </div>
          <div className="divide-y divide-white/[0.06] px-5">
            {topActivities.map((activity) => (
              <Link
                key={activity.label}
                href={activity.href}
                className="flex items-center justify-between gap-4 py-4 transition hover:translate-x-0.5"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-slate-300">
                  <span className={activity.tone}>{activity.icon}</span>
                  {activity.label}
                </span>
                <span className="text-sm font-semibold text-white">{activity.value}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Live operations</h2>
            <p className="mt-1 text-xs text-slate-500">Call and campaign metrics remain available at a glance.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {operationalMetrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="rounded-xl border border-white/[0.07] bg-[#0B1423]/80 px-4 py-3 transition hover:border-violet-400/20 hover:bg-[#111C2E]"
            >
              <p className="text-[11px] font-medium text-slate-500">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-white">{metric.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <FollowUpWidget
  today={dashboard.todayFollowUps}
  overdue={dashboard.overdueFollowUps}
  upcoming={dashboard.upcomingFollowUps}
/>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <AnalyticsCard
          title="Calls over time"
          description="Call volume recorded during the last seven days."
          href="/dashboard/call-analytics"
        >
          {callsOverTime.length > 0 ? (
            <div>
              <div className="flex h-64 items-end gap-3 sm:gap-5">
                {callsOverTime.map((point) => (
                  <div
                    key={point.key}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end"
                  >
                    <span className="mb-3 text-xs font-semibold text-slate-300">
                      {point.value}
                    </span>

                    <div className="flex h-44 w-full items-end rounded-2xl bg-white/[0.025] p-1.5">
                      <div
                        className="w-full rounded-xl bg-gradient-to-t from-cyan-500 to-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.16)] transition-all duration-700"
                        style={{
                          height: `${getBarHeight(
                            point.value,
                            maximumCalls,
                          )}%`,
                        }}
                      />
                    </div>

                    <span className="mt-3 max-w-full truncate text-xs text-slate-500">
                      {point.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-500">
                <span>Seven-day call activity</span>
                <span>
                  {callsOverTime.reduce(
                    (total, point) => total + point.value,
                    0,
                  )}{' '}
                  total calls
                </span>
              </div>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
              <ChartIcon className="h-7 w-7 text-slate-500" />
              <p className="mt-4 font-semibold text-white">
                No call activity yet
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Your seven-day call chart will appear after calls
                are recorded.
              </p>
            </div>
          )}
        </AnalyticsCard>

        <AnalyticsCard
          title="Call outcomes"
          description="Distribution of recent call results."
          href="/dashboard/call-analytics"
        >
          {callOutcomes.length > 0 ? (
            <div className="space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-semibold tracking-tight text-white">
                    {totalOutcomeCalls}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Tracked calls
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-violet-300">
                  <ActivityIcon />
                </div>
              </div>

              <div className="space-y-4">
                {callOutcomes.map((outcome, index) => {
                  const percentage =
                    outcome.percentage > 0
                      ? outcome.percentage
                      : totalOutcomeCalls > 0
                        ? (outcome.value / totalOutcomeCalls) * 100
                        : 0

                  return (
                    <div key={outcome.key}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${getOutcomeTone(index)}`}
                          />
                          <span className="truncate text-sm font-medium capitalize text-slate-300">
                            {outcome.label}
                          </span>
                        </div>

                        <span className="text-xs font-semibold text-slate-400">
                          {outcome.value} ·{' '}
                          {formatDashboardPercentage(percentage)}
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full ${getOutcomeTone(index)}`}
                          style={{
                            width: `${Math.min(
                              Math.max(percentage, 0),
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
              <ActivityIcon className="h-7 w-7 text-slate-500" />
              <p className="mt-4 font-semibold text-white">
                No outcomes available
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Call outcome data will appear after your team starts
                making calls.
              </p>
            </div>
          )}
        </AnalyticsCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <DataTable
            title="Recent calls"
            description="The latest calls recorded in your organization."
            columns={['Contact', 'Duration', 'Status', 'Date']}
            rows={recentCallsRows}
            rowHrefs={recentCallRowHrefs}
            emptyTitle="No calls recorded"
            emptyDescription="Start using the dialer to make your first call."
            actionHref="/dashboard/calls"
            actionLabel="View all calls"
          />

          <DataTable
            title="Recent contacts"
            description="The newest contacts added to your workspace."
            columns={['Name', 'Company', 'Status', 'Created']}
            rows={recentContactsRows}
            rowHrefs={recentContactRowHrefs}
            emptyTitle="No contacts available"
            emptyDescription="Create your first contact to begin organizing your leads."
            actionHref="/dashboard/contacts"
            actionLabel="View all contacts"
          />
        </div>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
            <Link
              href="/dashboard/timeline"
              className="group flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5 transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
            >
              <div>
                <h2 className="text-lg font-semibold text-white transition group-hover:text-cyan-200">
                  Activity feed
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Latest events from your workspace.
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <ActivityIcon className="h-4 w-4" />
              </div>
            </Link>

            <div className="p-6">
              {activityItems.length > 0 ? (
                <div className="space-y-1">
                  {activityItems.map((item, index) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="group relative flex gap-4 rounded-2xl px-2 py-2 pb-6 transition hover:bg-white/[0.035] last:pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                    >
                      {index < activityItems.length - 1 ? (
                        <div
                          aria-hidden="true"
                          className="absolute left-[17px] top-9 h-[calc(100%-1.25rem)] w-px bg-white/10"
                        />
                      ) : null}

                      <div className="relative z-10 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        <ActivityIcon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">
                          {item.title}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          {item.description}
                        </p>

                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-600">
                          {formatActivityTime(item.time, timeZone)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
                  <ActivityIcon className="mx-auto h-7 w-7 text-slate-500" />

                  <p className="mt-4 font-semibold text-white">
                    No recent activity
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Contact, call, and campaign events will appear
                    here.
                  </p>
                </div>
              )}
            </div>
          </section>

          <QuickActions actions={actions} />
        </div>
      </section>
    </div>
  )
}