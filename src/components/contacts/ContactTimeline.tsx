'use client'

import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  Activity,
  LoaderCircle,
  Phone,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useFormStatus } from 'react-dom'

import {
  completeContactTask,
  deleteContactTask,
} from '@/app/dashboard/contacts/actions'
import type { ContactActivity } from '@/lib/contact-activity'
import { formatCallDurationLabel } from '@/lib/formatters'

import AddActivityDialog from '@/components/activities/AddActivityDialog'
import AddNoteDialog from './AddNoteDialog'
import AddTaskDialog from './AddTaskDialog'
import EditTaskDialog from './EditTaskDialog'

import { useOrganizationTimezone } from '@/components/timezone/OrganizationTimezoneProvider'
type ContactTimelineProps = {
  contactId: string
  activities: ContactActivity[]
}

type TaskActionButtonProps = {
  idleLabel: string
  pendingLabel: string
  icon: 'complete' | 'reopen' | 'delete'
  className: string
}

function formatActivityDate(value: string, timeZone: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
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

function getStatusClasses(status: string): string {
  const normalizedStatus = status.trim().toLowerCase()

  if (
    normalizedStatus === 'completed' ||
    normalizedStatus === 'connected'
  ) {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  }

  if (
    normalizedStatus === 'failed' ||
    normalizedStatus === 'missed' ||
    normalizedStatus === 'cancelled'
  ) {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  }

  return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
}

function getPriorityClasses(priority: string): string {
  const normalizedPriority = priority.trim().toLowerCase()

  if (normalizedPriority === 'high') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  }

  if (normalizedPriority === 'low') {
    return 'border-sky-400/20 bg-sky-400/10 text-sky-300'
  }

  return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
}

function TaskActionButton({
  idleLabel,
  pendingLabel,
  icon,
  className,
}: TaskActionButtonProps) {
  const { pending } = useFormStatus()

  const Icon =
    icon === 'complete'
      ? CheckCircle2
      : icon === 'reopen'
        ? RotateCcw
        : Trash2

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}

      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

export default function ContactTimeline({
  contactId,
  activities,
}: ContactTimelineProps) {
  const timeZone = useOrganizationTimezone()
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B1726]/90 shadow-[0_30px_80px_-45px_rgba(13,54,124,0.65)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Activity Timeline
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Calls, notes, tasks, and other activity associated with this
            contact.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AddActivityDialog contactId={contactId} />
          <AddTaskDialog contactId={contactId} />
          <AddNoteDialog contactId={contactId} />
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="p-6">
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
              <Clock3 className="h-5 w-5" />
            </div>

            <h3 className="mt-4 font-medium text-white">
              No activity yet
            </h3>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Calls, notes, follow-up tasks, recordings, transcripts,
              and other events will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-6 py-2">
          {activities.map((activity, index) => {
            const isLast = index === activities.length - 1

            if (activity.type === 'call') {
              const call = activity.call
              const inbound =
                call.direction.trim().toLowerCase() === 'inbound'

              return (
                <article
                  key={activity.id}
                  className="relative flex gap-4 py-5"
                >
                  {!isLast ? (
                    <div className="absolute bottom-0 left-[21px] top-12 w-px bg-white/10" />
                  ) : null}

                  <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.08] text-cyan-300">
                    {inbound ? (
                      <ArrowDownLeft className="h-5 w-5" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-white">
                        {inbound ? 'Inbound call' : 'Outbound call'}
                      </h3>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${getStatusClasses(
                          call.status,
                        )}`}
                      >
                        {call.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        {formatActivityDate(activity.occurredAt, timeZone)}
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />

                        {formatCallDurationLabel(
                          call.duration_seconds,
                        )}
                      </span>
                    </div>
                  </div>
                </article>
              )
            }

            if (activity.type === 'timeline') {
              const item = activity.timeline
              return (
                <article key={activity.id} className="relative flex gap-4 py-5">
                  {!isLast ? <div className="absolute bottom-0 left-[21px] top-12 w-px bg-white/10" /> : null}
                  <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-400/15 bg-sky-400/[0.08] text-sky-300"><Clock3 className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-white">{item.title}</h3><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">{item.event_type}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-400">{item.event_action.replaceAll('_', ' ')}</span></div>
                    {item.description ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">{item.description}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">{formatActivityDate(activity.occurredAt, timeZone)} · {item.source_table}</p>
                  </div>
                </article>
              )
            }

            if (activity.type === 'activity') {
              const item = activity.activity
              return (
                <article key={activity.id} className="relative flex gap-4 py-5">
                  {!isLast ? <div className="absolute bottom-0 left-[21px] top-12 w-px bg-white/10" /> : null}
                  <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-400/[0.08] text-violet-300"><Activity className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-white">{item.subject}</h3><span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-300">{item.activity_type.replaceAll('_', ' ')}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${getStatusClasses(item.status)}`}>{item.status.replaceAll('_', ' ')}</span></div>
                    {item.body ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">{item.body}</p> : null}
                    {item.outcome ? <p className="mt-2 text-sm text-slate-400"><span className="font-medium text-slate-300">Outcome:</span> {item.outcome}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">{formatActivityDate(activity.occurredAt, timeZone)} · {item.direction}</p>
                  </div>
                </article>
              )
            }

            if (activity.type === 'task') {
              const task = activity.task
              const isCompleted = task.status === 'completed'

              return (
                <article
                  key={activity.id}
                  className="relative flex gap-4 py-5"
                >
                  {!isLast ? (
                    <div className="absolute bottom-0 left-[21px] top-12 w-px bg-white/10" />
                  ) : null}

                  <div
                    className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                      isCompleted
                        ? 'border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300'
                        : 'border-amber-400/15 bg-amber-400/[0.08] text-amber-300'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Clock3 className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-white">
                        Follow-up task
                      </h3>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${getStatusClasses(
                          task.status,
                        )}`}
                      >
                        {task.status}
                      </span>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${getPriorityClasses(
                          task.priority,
                        )}`}
                      >
                        {task.priority} priority
                      </span>
                    </div>

                    <p
                      className={`mt-3 text-sm font-medium ${
                        isCompleted
                          ? 'text-slate-500 line-through'
                          : 'text-slate-200'
                      }`}
                    >
                      {task.title}
                    </p>

                    {task.description ? (
                      <p
                        className={`mt-2 whitespace-pre-wrap break-words text-sm leading-7 ${
                          isCompleted
                            ? 'text-slate-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {task.description}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        {task.due_at
                          ? `Due ${formatActivityDate(task.due_at, timeZone)}`
                          : `Created ${formatActivityDate(
                              task.created_at,
                              timeZone,
                            )}`}
                      </span>

                      {task.completed_at ? (
                        <span>
                          Completed{' '}
                          {formatActivityDate(task.completed_at, timeZone)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <form action={completeContactTask}>
                        <input
                          type="hidden"
                          name="taskId"
                          value={task.id}
                        />

                        <input
                          type="hidden"
                          name="contactId"
                          value={contactId}
                        />

                        <input
                          type="hidden"
                          name="status"
                          value={isCompleted ? 'pending' : 'completed'}
                        />

                        <TaskActionButton
                          idleLabel={isCompleted ? 'Reopen' : 'Complete'}
                          pendingLabel={
                            isCompleted ? 'Reopening...' : 'Completing...'
                          }
                          icon={isCompleted ? 'reopen' : 'complete'}
                          className={
                            isCompleted
                              ? 'inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-300/30 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60'
                              : 'inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60'
                          }
                        />
                      </form>

                      <EditTaskDialog
                        contactId={contactId}
                        task={task}
                      />

                      <form
                        action={deleteContactTask}
                        onSubmit={(event) => {
                          const confirmed = window.confirm(
                            `Delete "${task.title}"? This action cannot be undone.`,
                          )

                          if (!confirmed) {
                            event.preventDefault()
                          }
                        }}
                      >
                        <input
                          type="hidden"
                          name="taskId"
                          value={task.id}
                        />

                        <input
                          type="hidden"
                          name="contactId"
                          value={contactId}
                        />

                        <TaskActionButton
                          idleLabel="Delete"
                          pendingLabel="Deleting..."
                          icon="delete"
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:border-rose-300/30 hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </form>
                    </div>
                  </div>
                </article>
              )
            }

            const note = activity.note
            const wasEdited = note.updated_at !== note.created_at

            return (
              <article
                key={activity.id}
                className="relative flex gap-4 py-5"
              >
                {!isLast ? (
                  <div className="absolute bottom-0 left-[21px] top-12 w-px bg-white/10" />
                ) : null}

                <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-400/[0.08] text-violet-300">
                  <FileText className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-white">
                      Note added
                    </h3>

                    {wasEdited ? (
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-400">
                        Edited
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                    {note.body}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {formatActivityDate(activity.occurredAt, timeZone)}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}