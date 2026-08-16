'use client'

import {
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Plus,
  Trash2,
  Video,
  X,
} from 'lucide-react'

import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '@/app/dashboard/calendar/actions'

import { toOrganizationDateTimeLocal } from '@/lib/timezone'
type SelectOption = {
  id: string
  label: string
}

type CalendarEvent = {
  id: string
  title: string
  description: string | null
  event_type: string
  status: string
  starts_at: string
  ends_at: string
  timezone: string
  all_day: boolean
  location: string | null
  meeting_provider: string
  meeting_url: string | null
  host_url: string | null
  meeting_password: string | null
  contact_id: string | null
  company_id: string | null
  opportunity_id: string | null
  owner_id: string | null
  created_by: string
  attendee_emails: string[]
  visibility: 'private' | 'team' | 'organization'
  color: string
  recurrence_rule: string | null
  reminder_minutes: number[]
  attendee_response_required: boolean
  cancellation_reason: string | null
  completed_at: string | null
  event_version: number
}

type Props = {
  events: CalendarEvent[]
  contacts: SelectOption[]
  companies: SelectOption[]
  opportunities: SelectOption[]
  members: SelectOption[]
  currentUserId: string
  timezone: string
  zoomConnected: boolean
  teamsConnected: boolean
  googleCalendarConnected: boolean
}

type ViewMode = 'month' | 'agenda'

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const emptySubscribe = () => () => undefined

function organizationDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const map = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  )
  return `${map.year}-${map.month}-${map.day}`
}

function calendarDayKey(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function organizationDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

function organizationCalendarDate(value: Date, timeZone: string) {
  const parts = organizationDateParts(value, timeZone)
  return new Date(parts.year, parts.month - 1, parts.day)
}

function organizationEventDay(value: Date, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      day: 'numeric',
    }).format(value),
  )
}

function eventTone(type: string) {
  if (type === 'call') {
    return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  }

  if (type === 'task') {
    return 'border-violet-400/30 bg-violet-400/10 text-violet-100'
  }

  if (type === 'demo') {
    return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
  }

  return 'border-blue-400/30 bg-blue-400/10 text-blue-100'
}

export default function CalendarBoard({
  events,
  contacts,
  companies,
  opportunities,
  members,
  currentUserId,
  timezone,
  zoomConnected,
  teamsConnected,
  googleCalendarConnected,
}: Props) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  const [cursor, setCursor] = useState(() => organizationCalendarDate(new Date(), timezone))
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'month'

    const savedView = window.localStorage.getItem('flowtix-calendar-view')

    return savedView === 'agenda' ? 'agenda' : 'month'
  })
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([])
  const [attendeeInput, setAttendeeInput] = useState('')
  const [attendeeError, setAttendeeError] = useState('')
  const [pending, startTransition] = useTransition()

  function changeView(nextView: ViewMode) {
    setView(nextView)
    window.localStorage.setItem('flowtix-calendar-view', nextView)
  }

  const monthCells = useMemo(() => {
    const first = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      1,
    )

    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - first.getDay())

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart)
      day.setDate(gridStart.getDate() + index)

      return day
    })
  }, [cursor])

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) =>
        left.starts_at.localeCompare(right.starts_at),
      ),
    [events],
  )

  const defaultStart = useMemo(() => {
    const start = new Date()

    start.setMinutes(
      Math.ceil(start.getMinutes() / 15) * 15,
      0,
      0,
    )

    return start
  }, [])

  const defaultEnd = useMemo(
    () => new Date(defaultStart.getTime() + 30 * 60_000),
    [defaultStart],
  )

  function submit(
    action: (data: FormData) => Promise<void>,
    formData: FormData,
  ) {
    setError('')

    startTransition(async () => {
      try {
        await action(formData)
        setCreating(false)
        setSelected(null)
        setAttendeeEmails([])
        setAttendeeInput('')
        setAttendeeError('')
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to save the event.',
        )
      }
    })
  }

  function openCreateDialog() {
    setSelected(null)
    setCreating(true)
    setError('')
    setAttendeeEmails([])
    setAttendeeInput('')
    setAttendeeError('')
  }

  function openEventDialog(event: CalendarEvent) {
    setCreating(false)
    setSelected(event)
    setError('')
    setAttendeeEmails(event.attendee_emails ?? [])
    setAttendeeInput('')
    setAttendeeError('')
  }

  function closeDialog() {
    setCreating(false)
    setSelected(null)
    setError('')
    setAttendeeEmails([])
    setAttendeeInput('')
    setAttendeeError('')
  }

  function addAttendeeEmails(rawValue = attendeeInput) {
    const candidates = rawValue
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)

    if (candidates.length === 0) {
      return
    }

    const invalidEmail = candidates.find(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    )

    if (invalidEmail) {
      setAttendeeError(`Enter a valid email address: ${invalidEmail}`)
      return
    }

    setAttendeeEmails((current) =>
      Array.from(new Set([...current, ...candidates])),
    )
    setAttendeeInput('')
    setAttendeeError('')
  }

  function removeAttendeeEmail(emailToRemove: string) {
    setAttendeeEmails((current) =>
      current.filter((email) => email !== emailToRemove),
    )
    setAttendeeError('')
  }

  function deleteSelectedEvent() {
    if (!selected) {
      return
    }

    const formData = new FormData()
    formData.set('id', selected.id)

    submit(deleteCalendarEvent, formData)
  }

  if (!mounted) {
    return (
      <div
        aria-label="Loading calendar"
        className="min-h-[32rem] animate-pulse rounded-[28px] border border-white/10 bg-white/[0.025]"
      />
    )
  }

  const today = new Date()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.035] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCursor(organizationCalendarDate(new Date(), timezone))}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
          >
            Today
          </button>

          <button
            type="button"
            onClick={() =>
              setCursor(
                new Date(
                  cursor.getFullYear(),
                  cursor.getMonth() - 1,
                  1,
                ),
              )
            }
            className="rounded-xl p-2 hover:bg-white/5"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() =>
              setCursor(
                new Date(
                  cursor.getFullYear(),
                  cursor.getMonth() + 1,
                  1,
                ),
              )
            }
            className="rounded-xl p-2 hover:bg-white/5"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div>
            <h2 className="text-xl font-semibold text-white">
              {cursor.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Organization time zone: {timezone}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-2xl border border-white/10 bg-[#07111F] p-1">
            {(['month', 'agenda'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeView(mode)}
                className={
                  view === mode
                    ? 'rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-xl px-4 py-2 text-sm text-slate-400'
                }
              >
                {mode === 'month' ? 'Month' : 'Agenda'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            New event
          </button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025]">
          <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.025]">
            {weekDays.map((day) => (
              <div
                key={day}
                className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.15em] text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-white/10">
            {monthCells.map((day) => {
              const dayEvents = sortedEvents.filter((event) =>
                organizationDateKey(new Date(event.starts_at), timezone) === calendarDayKey(day),
              )

              const muted =
                day.getMonth() !== cursor.getMonth()

              const dayNumberClassName = calendarDayKey(day) === organizationDateKey(today, timezone)
                ? 'mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white'
                : muted
                  ? 'mb-2 text-xs text-slate-600'
                  : 'mb-2 text-xs text-slate-400'

              return (
                <div
                  key={day.toISOString()}
                  className="min-h-32 min-w-0 overflow-hidden bg-[#0A1524] p-2 sm:min-h-36"
                >
                  <div className={dayNumberClassName}>
                    {day.getDate()}
                  </div>

                  <div className="space-y-1.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openEventDialog(event)}
                        className={`block w-full min-w-0 truncate rounded-lg border px-2 py-1.5 text-left text-xs ${eventTone(
                          event.event_type,
                        )}`}
                      >
                        {new Date(
                          event.starts_at,
                        ).toLocaleTimeString('en-US', {
                          timeZone: timezone,
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        {event.title}
                      </button>
                    ))}

                    {dayEvents.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setView('agenda')}
                        className="px-1 text-xs text-slate-500"
                      >
                        +{dayEvents.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedEvents.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-white/15 p-12 text-center text-slate-400">
              No events yet. Create the organization’s first
              event.
            </div>
          ) : (
            sortedEvents.map((event) => {
              const eventStart = new Date(event.starts_at)
              const eventEnd = new Date(event.ends_at)

              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openEventDialog(event)}
                  className="flex w-full items-center gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-left hover:bg-white/[0.05]"
                >
                  <div className="min-w-20 rounded-2xl bg-white/5 px-3 py-2 text-center">
                    <div className="text-xs uppercase text-slate-500">
                      {eventStart.toLocaleDateString(undefined, {
                        timeZone: timezone,
                        month: 'short',
                      })}
                    </div>

                    <div className="text-2xl font-semibold text-white">
                      {organizationEventDay(eventStart, timezone)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">
                      {event.title}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-4 w-4" />
                        {eventStart.toLocaleString('en-US', { timeZone: timezone })} –{' '}
                        {eventEnd.toLocaleTimeString([], {
                          timeZone: timezone,
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>

                      {event.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs ${eventTone(
                      event.event_type,
                    )}`}
                  >
                    {event.event_type}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}

      {(creating || selected) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-white/10 bg-[#0B1726] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {selected
                    ? 'Event details'
                    : 'Create calendar event'}
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Shared with your Flowtix organization.
                </p>
              </div>

              <button
                type="button"
                onClick={closeDialog}
                className="rounded-xl p-2 hover:bg-white/5"
                aria-label="Close calendar event dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            <form
              action={(formData) => {
                const pendingEmail = attendeeInput.trim().toLowerCase()
                const submittedEmails = [...attendeeEmails]

                if (pendingEmail) {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)) {
                    setAttendeeError(
                      `Enter a valid email address: ${pendingEmail}`,
                    )
                    return
                  }

                  submittedEmails.push(pendingEmail)
                }

                formData.set(
                  'attendee_emails',
                  Array.from(new Set(submittedEmails)).join(', '),
                )

                submit(
                  selected
                    ? updateCalendarEvent
                    : createCalendarEvent,
                  formData,
                )
              }}
              className="grid gap-4 md:grid-cols-2"
            >
              {selected && (
                <input
                  type="hidden"
                  name="id"
                  value={selected.id}
                />
              )}

              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Title
                </span>

                <input
                  required
                  name="title"
                  defaultValue={selected?.title ?? ''}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none focus:border-blue-500"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Starts
                </span>

                <input
                  required
                  type="datetime-local"
                  name="starts_at"
                  defaultValue={toOrganizationDateTimeLocal(
                    selected
                      ? new Date(selected.starts_at)
                      : defaultStart,
                    timezone,
                  )}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Ends
                </span>

                <input
                  required
                  type="datetime-local"
                  name="ends_at"
                  defaultValue={toOrganizationDateTimeLocal(
                    selected
                      ? new Date(selected.ends_at)
                      : defaultEnd,
                    timezone,
                  )}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Type
                </span>

                <select
                  name="event_type"
                  defaultValue={
                    selected?.event_type ?? 'meeting'
                  }
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="meeting">Meeting</option>
                  <option value="demo">Demo</option>
                  <option value="call">Call</option>
                  <option value="task">
                    Task / follow-up
                  </option>
                  <option value="internal">
                    Internal event
                  </option>
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Status
                </span>

                <select
                  name="status"
                  defaultValue={
                    selected?.status ?? 'scheduled'
                  }
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No show</option>
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">Visibility</span>
                <select
                  name="visibility"
                  defaultValue={selected?.visibility ?? 'organization'}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="organization">Organization</option>
                  <option value="team">Team</option>
                  <option value="private">Private</option>
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">Calendar color</span>
                <input
                  type="color"
                  name="color"
                  defaultValue={selected?.color ?? '#3b82f6'}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#07111F] px-3 py-2"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">Recurrence</span>
                <select
                  name="recurrence_rule"
                  defaultValue={selected?.recurrence_rule ?? ''}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="">Does not repeat</option>
                  <option value="FREQ=DAILY">Daily</option>
                  <option value="FREQ=WEEKLY">Weekly</option>
                  <option value="FREQ=MONTHLY">Monthly</option>
                  <option value="FREQ=YEARLY">Yearly</option>
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">Reminder</span>
                <select
                  name="reminder_minutes"
                  defaultValue={String(selected?.reminder_minutes?.[0] ?? 15)}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="0">At event time</option>
                  <option value="5">5 minutes before</option>
                  <option value="10">10 minutes before</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="1440">1 day before</option>
                </select>
              </label>

              {!selected && (
                <label>
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Meeting method
                  </span>

                  <select
                    name="meeting_provider"
                    defaultValue="none"
                    className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                  >
                    <option value="none">
                      No video meeting
                    </option>

                    {zoomConnected && (
                      <option value="zoom">Zoom</option>
                    )}

                    {teamsConnected && (
                      <option value="teams">
                        Microsoft Teams
                      </option>
                    )}

                    <option value="custom">
                      Custom link
                    </option>
                  </select>
                </label>
              )}

              {!selected && (
                <label>
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Custom meeting link
                  </span>

                  <input
                    name="meeting_url"
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                  />
                </label>
              )}

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Assigned member
                </span>

                <select
                  name="owner_id"
                  defaultValue={
                    selected?.owner_id ?? currentUserId
                  }
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  {members.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Contact
                </span>

                <select
                  name="contact_id"
                  defaultValue={selected?.contact_id ?? ''}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="">No contact</option>

                  {contacts.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Company
                </span>

                <select
                  name="company_id"
                  defaultValue={selected?.company_id ?? ''}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="">No company</option>

                  {companies.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Deal
                </span>

                <select
                  name="opportunity_id"
                  defaultValue={
                    selected?.opportunity_id ?? ''
                  }
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                >
                  <option value="">No deal</option>

                  {opportunities.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Location
                </span>

                <input
                  name="location"
                  defaultValue={selected?.location ?? ''}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                />
              </label>

              <input
                type="hidden"
                name="timezone"
                value={timezone}
              />

              <div className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Attendee emails
                </span>

                <input
                  type="hidden"
                  name="attendee_emails"
                  value={attendeeEmails.join(', ')}
                />

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={attendeeInput}
                    onChange={(event) => {
                      setAttendeeInput(event.target.value)
                      setAttendeeError('')
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' ||
                        event.key === ',' ||
                        event.key === ';'
                      ) {
                        event.preventDefault()
                        addAttendeeEmails()
                      }
                    }}
                    onPaste={(event) => {
                      const pastedText = event.clipboardData.getData('text')

                      if (/[\s,;]/.test(pastedText.trim())) {
                        event.preventDefault()
                        addAttendeeEmails(pastedText)
                      }
                    }}
                    placeholder="attendee@example.com"
                    aria-label="Attendee email address"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white outline-none focus:border-blue-500"
                  />

                  <button
                    type="button"
                    onClick={() => addAttendeeEmails()}
                    disabled={!attendeeInput.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add email
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Press Enter, comma, or semicolon to add each attendee.
                </p>

                {attendeeError && (
                  <p className="mt-2 text-sm text-red-300">
                    {attendeeError}
                  </p>
                )}

                {attendeeEmails.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {attendeeEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5 text-sm text-blue-100"
                      >
                        <span className="truncate">{email}</span>
                        <button
                          type="button"
                          onClick={() => removeAttendeeEmail(email)}
                          aria-label={`Remove ${email}`}
                          className="rounded-full p-0.5 text-blue-200 hover:bg-white/10 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                <input
                  type="checkbox"
                  name="attendee_response_required"
                  defaultChecked={selected?.attendee_response_required ?? true}
                  className="h-4 w-4"
                />
                Request attendee responses
              </label>

              {selected?.status === 'cancelled' && (
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-300">Cancellation reason</span>
                  <input
                    name="cancellation_reason"
                    defaultValue={selected.cancellation_reason ?? ''}
                    className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                  />
                </label>
              )}

              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Description
                </span>

                <textarea
                  name="description"
                  defaultValue={selected?.description ?? ''}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-white"
                />
              </label>

              {!selected && googleCalendarConnected && (
                <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    name="sync_google_calendar"
                    defaultChecked
                    className="h-4 w-4"
                  />

                  Also create this event in the connected
                  Google Calendar
                </label>
              )}

              {selected?.meeting_url && (
                <div className="md:col-span-2 flex flex-wrap gap-3 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">
                  <a
                    href={selected.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <Video className="h-4 w-4" />
                    Join meeting
                  </a>

                  {selected.host_url && (
                    <a
                      href={selected.host_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Start as host
                    </a>
                  )}
                </div>
              )}

              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-3">
                {selected ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={deleteSelectedEvent}
                    className="inline-flex items-center gap-2 rounded-2xl border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-400/10 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending
                    ? 'Saving…'
                    : selected
                      ? 'Save changes'
                      : 'Create event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}