'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LoaderCircle,
} from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { completeContactTask } from '@/app/dashboard/contacts/actions'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
type DashboardFollowUp = {
  id: string
  contactId: string
  contactName: string
  title: string
  description: string | null
  dueAt: string
  priority: 'low' | 'medium' | 'high'
}

type FollowUpWidgetProps = {
  today: DashboardFollowUp[]
  overdue: DashboardFollowUp[]
  upcoming: DashboardFollowUp[]
}

type FollowUpSectionProps = {
  title: string
  description: string
  items: DashboardFollowUp[]
  emptyMessage: string
  tone: 'overdue' | 'today' | 'upcoming'
  timeZone: string
}

type PriorityTone = {
  label: string
  className: string
}

const priorityTones: Record<
  DashboardFollowUp['priority'],
  PriorityTone
> = {
  low: {
    label: 'Low',
    className:
      'border-slate-400/20 bg-slate-400/10 text-slate-300',
  },
  medium: {
    label: 'Medium',
    className:
      'border-amber-400/20 bg-amber-400/10 text-amber-300',
  },
  high: {
    label: 'High',
    className:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',
  },
}

const sectionTones = {
  overdue: {
    count:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',
    icon:
      'border-rose-400/20 bg-rose-400/10 text-rose-300',
    item:
      'hover:border-rose-400/25 hover:bg-rose-400/[0.04]',
    iconElement: AlertTriangle,
  },
  today: {
    count:
      'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    icon:
      'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    item:
      'hover:border-cyan-400/25 hover:bg-cyan-400/[0.04]',
    iconElement: CalendarClock,
  },
  upcoming: {
    count:
      'border-violet-400/20 bg-violet-400/10 text-violet-300',
    icon:
      'border-violet-400/20 bg-violet-400/10 text-violet-300',
    item:
      'hover:border-violet-400/25 hover:bg-violet-400/[0.04]',
    iconElement: CalendarDays,
  },
} as const

function formatDueDate(value: string, timeZone: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'No due date'
  }

  return new Intl.DateTimeFormat('en', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function CompleteTaskButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={pending ? 'Completing task' : 'Mark task complete'}
      title={pending ? 'Completing task...' : 'Mark complete'}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 transition hover:border-emerald-300/30 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
    </button>
  )
}

function FollowUpSection({
  title,
  description,
  items,
  emptyMessage,
  tone,
  timeZone,
}: FollowUpSectionProps) {
  const sectionTone = sectionTones[tone]
  const SectionIcon = sectionTone.iconElement

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${sectionTone.icon}`}
          >
            <SectionIcon className="h-4 w-4" />
          </div>

          <Link
            href="/dashboard/tasks"
            className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <h3 className="font-semibold text-white transition group-hover:text-cyan-200">
              {title}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {description}
            </p>
          </Link>
        </div>

        <Link
          href="/dashboard/tasks"
          aria-label={`Open ${title} tasks`}
          className={`inline-flex min-w-8 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${sectionTone.count}`}
        >
          {items.length}
        </Link>
      </div>

      <div className="divide-y divide-white/10">
        {items.length > 0 ? (
          items.slice(0, 5).map((item) => {
            const priority = priorityTones[item.priority]

            return (
              <article
                key={item.id}
                className={`flex items-start gap-3 px-5 py-4 transition ${sectionTone.item}`}
              >
                <Link
                  href={`/dashboard/contacts/${item.contactId}`}
                  className="group min-w-0 flex-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.title}
                        </p>

                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${priority.className}`}
                        >
                          {priority.label}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-sm text-slate-400">
                        {item.contactName}
                      </p>

                      {item.description ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                          {item.description}
                        </p>
                      ) : null}

                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>{formatDueDate(item.dueAt, timeZone)}</span>
                      </div>
                    </div>

                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
                  </div>
                </Link>

                <form action={completeContactTask}>
                  <input
                    type="hidden"
                    name="taskId"
                    value={item.id}
                  />
                  <input
                    type="hidden"
                    name="contactId"
                    value={item.contactId}
                  />
                  <input
                    type="hidden"
                    name="status"
                    value="completed"
                  />
                  <CompleteTaskButton />
                </form>
              </article>
            )
          })
        ) : (
          <Link
            href="/dashboard/tasks"
            className="block px-5 py-8 text-center transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
          >
            <p className="text-sm font-medium text-slate-300">
              {emptyMessage}
            </p>
          </Link>
        )}
      </div>

      {items.length > 5 ? (
        <div className="border-t border-white/10 px-5 py-3 text-center text-xs text-slate-500">
          Showing 5 of {items.length} follow-ups
        </div>
      ) : null}
    </section>
  )
}

export default function FollowUpWidget({
  today,
  overdue,
  upcoming,
}: FollowUpWidgetProps) {
  const timeZone = useOrganizationTimezone()
  const totalFollowUps =
    today.length + overdue.length + upcoming.length

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Follow-up tasks
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Keep track of overdue, due today, and upcoming
            contact tasks.
          </p>
        </div>

        <Link
          href="/dashboard/tasks"
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <CalendarClock className="h-4 w-4 text-cyan-300" />
          {totalFollowUps}{' '}
          {totalFollowUps === 1 ? 'open task' : 'open tasks'}
        </Link>
      </div>

      <div className="grid gap-5 p-6 xl:grid-cols-3">
        <FollowUpSection
          title="Overdue"
          description="Tasks that need immediate attention."
          items={overdue}
          emptyMessage="No overdue follow-ups."
          tone="overdue"
          timeZone={timeZone}
        />

        <FollowUpSection
          title="Due today"
          description="Follow-ups scheduled for today."
          items={today}
          emptyMessage="No follow-ups due today."
          tone="today"
          timeZone={timeZone}
        />

        <FollowUpSection
          title="Upcoming"
          description="Tasks scheduled after today."
          items={upcoming}
          emptyMessage="No upcoming follow-ups."
          tone="upcoming"
          timeZone={timeZone}
        />
      </div>
    </section>
  )
}