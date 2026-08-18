import { requireFeature } from '@/lib/auth'

import DialerClient from './DialerClient'
import { getAssignedDialerContacts, getDialerContactById } from './actions'

type DialerPageProps = {
  searchParams?: Promise<{
    contactId?: string
    phone?: string
  }>
}

export default async function DialerPage({
  searchParams,
}: DialerPageProps) {
  const params = await searchParams
  const organization = await requireFeature(
    'dialer.cloud',
    'calls.create',
  )

  const contactId = params?.contactId?.trim() ?? ''
  const initialPhoneNumber = params?.phone?.trim() ?? ''

  const [initialContact, assignedContacts] = await Promise.all([
    contactId.length > 0
      ? getDialerContactById(contactId)
      : Promise.resolve(null),
    getAssignedDialerContacts(),
  ])

  return (
    <DialerClient
      organizationId={organization.organization_id}
      initialContact={initialContact}
      initialPhoneNumber={initialPhoneNumber}
      assignedContacts={assignedContacts}
    />
  )
}
