import { requireFeature } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

import DialerClient from './DialerClient'
import { getAssignedDialerContacts, getDialerContactById } from './actions'

type DialerPageProps = {
  searchParams?: Promise<{
    contactId?: string
    phone?: string
  }>
}

export type DialerPhoneNumber = {
  id: string
  phoneNumber: string
  friendlyName: string
  isDefault: boolean
  provider: 'signalwire'
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

  const supabase = await createClient()
  const { data: phoneNumberRows, error: phoneNumberError } = await supabase
    .from('organization_phone_numbers')
    .select(
      'id,provider,phone_number,friendly_name,is_default,capabilities',
    )
    .eq('organization_id', organization.organization_id)
    .eq('provider', 'signalwire')
    .order('is_default', { ascending: false })
    .order('friendly_name', { ascending: true })

  if (phoneNumberError) {
    throw new Error(
      `Unable to load workspace phone numbers: ${phoneNumberError.message}`,
    )
  }

  const callerIds: DialerPhoneNumber[] = (phoneNumberRows ?? [])
    .filter((row) => {
      const capabilities =
        row.capabilities && typeof row.capabilities === 'object'
          ? (row.capabilities as Record<string, unknown>)
          : {}

      return capabilities.voice !== false
    })
    .map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      friendlyName: row.friendly_name,
      isDefault: row.is_default,
      provider: 'signalwire',
    }))

  return (
    <DialerClient
      organizationId={organization.organization_id}
      initialContact={initialContact}
      initialPhoneNumber={initialPhoneNumber}
      callerIds={callerIds}
      assignedContacts={assignedContacts}
    />
  )
}
