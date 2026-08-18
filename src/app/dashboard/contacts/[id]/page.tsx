import { notFound } from 'next/navigation'

import ContactAISummary from '@/components/contacts/ContactAISummary'
import ContactHeader from '@/components/contacts/ContactHeader'
import ContactProfileCard from '@/components/contacts/ContactProfileCard'
import ContactQuickActions from '@/components/contacts/ContactQuickActions'
import ContactConversationsCard from '@/components/contacts/ContactConversationsCard'
import ContactTags from '@/components/contacts/ContactTags'
import ContactTimeline from '@/components/contacts/ContactTimeline'
import { requirePermission } from '@/lib/auth'
import { getContactActivity } from '@/lib/contact-activity'
import { getActivities } from '@/lib/activities'
import { getContactCalls } from '@/lib/contact-calls'
import { getContactNotes } from '@/lib/contact-notes'
import { getContactTasks } from '@/lib/contact-tasks'
import { getTimelineEvents } from '@/lib/timeline'
import { getContact } from '@/lib/contacts'
import { getContactConversationPreviews } from '@/lib/communications/conversations'
import { getEntityTags, getTags } from '@/lib/tags'

type ContactPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ContactPage({
  params,
}: ContactPageProps) {
  const organization = await requirePermission('contacts.view')

  const { id } = await params

  const [
    contact,
    calls,
    notes,
    tasks,
    crmActivities,
    timelineEvents,
    availableTags,
    assignedTags,
    conversations,
  ] = await Promise.all([
    getContact(id),
    getContactCalls(id),
    getContactNotes(id),
    getContactTasks(id),
    getActivities({ organizationId: organization.organization_id, contactId: id, limit: 100 }),
    getTimelineEvents({ organizationId: organization.organization_id, contactId: id, limit: 150 }),
    getTags(organization.organization_id),
    getEntityTags({
      organizationId: organization.organization_id,
      entityType: 'contact',
      entityId: id,
    }),
    getContactConversationPreviews({
      organizationId: organization.organization_id,
      contactId: id,
      limit: 3,
    }),
  ])

  if (!contact) {
    notFound()
  }

  const activities = getContactActivity({
    calls,
    notes,
    tasks,
    crmActivities,
    timelineEvents,
  })

  return (
    <div className="space-y-6">
      <ContactHeader contact={contact} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)_minmax(280px,0.62fr)]">
        <div className="min-w-0 space-y-6">
          <ContactProfileCard contact={contact} />

          <ContactTags
            contactId={contact.id}
            availableTags={availableTags}
            assignedTags={assignedTags}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <ContactAISummary contact={contact} />

          <ContactConversationsCard conversations={conversations} />

          <ContactTimeline
            contactId={contact.id}
            activities={activities}
          />
        </div>

        <aside className="min-w-0">
          <ContactQuickActions contact={contact} />
        </aside>
      </div>
    </div>
  )
}
