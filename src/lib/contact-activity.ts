import type { ContactCall } from '@/lib/contact-calls'
import type { ContactNote } from '@/lib/contact-notes'
import type { ContactTask } from '@/lib/contact-tasks'
import type { CrmActivity } from '@/lib/activities'

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

type GetContactActivityInput = {
  calls: ContactCall[]
  notes: ContactNote[]
  tasks: ContactTask[]
  crmActivities?: CrmActivity[]
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
  ]

  return activities.sort(
    (a, b) => timestamp(b.occurredAt) - timestamp(a.occurredAt),
  )
}