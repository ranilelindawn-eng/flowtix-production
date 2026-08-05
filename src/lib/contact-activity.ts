import type { ContactCall } from '@/lib/contact-calls'
import type { ContactNote } from '@/lib/contact-notes'
import type { ContactTask } from '@/lib/contact-tasks'
import type { CrmActivity } from '@/lib/activities'
import type { TimelineEvent } from '@/lib/timeline'

export type ContactActivity =
  | {
      id: string
      type: 'call'
      occurredAt: string
      call: ContactCall
    }
  | {
      id: string
      type: 'note'
      occurredAt: string
      note: ContactNote
    }
  | {
      id: string
      type: 'task'
      occurredAt: string
      task: ContactTask
    }
  | {
      id: string
      type: 'activity'
      occurredAt: string
      activity: CrmActivity
    }
  | {
      id: string
      type: 'timeline'
      occurredAt: string
      timeline: TimelineEvent
    }

type GetContactActivityInput = {
  calls: ContactCall[]
  notes: ContactNote[]
  tasks: ContactTask[]
  crmActivities?: CrmActivity[]
  timelineEvents?: TimelineEvent[]
}

function timestamp(value: string | null): number {
  if (!value) return 0

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

export function getContactActivity({
  calls,
  notes,
  tasks,
  crmActivities = [],
  timelineEvents = [],
}: GetContactActivityInput): ContactActivity[] {
  const activities: ContactActivity[] = [
    ...calls.map((call) => ({
      id: `call-${call.id}`,
      type: 'call' as const,
      occurredAt: call.started_at,
      call,
    })),

    ...notes.map((note) => ({
      id: `note-${note.id}`,
      type: 'note' as const,
      occurredAt: note.created_at,
      note,
    })),

    ...crmActivities.map((activity) => ({
      id: `activity-${activity.id}`,
      type: 'activity' as const,
      occurredAt: activity.occurred_at,
      activity,
    })),

    ...tasks.map((task) => ({
      id: `task-${task.id}`,
      type: 'task' as const,
      occurredAt: task.due_at ?? task.created_at,
      task,
    })),

    ...timelineEvents
      .filter((event) => !['calls', 'contact_notes', 'contact_tasks', 'crm_activities'].includes(event.source_table))
      .map((event) => ({
        id: `timeline-${event.id}`,
        type: 'timeline' as const,
        occurredAt: event.occurred_at,
        timeline: event,
      })),
  ]

  return activities.sort(
    (a, b) => timestamp(b.occurredAt) - timestamp(a.occurredAt),
  )
}