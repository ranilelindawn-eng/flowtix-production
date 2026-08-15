'use server'

import { revalidatePath } from 'next/cache'

import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { configureProviderInboundRouting } from '@/lib/telephony/provider-admin'

const clean = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

export async function setDefaultPhoneNumber(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const id = clean(formData, 'id')
  const { error } = await supabase.rpc('set_workspace_default_phone_number', {
    target_organization: organizationId,
    target_phone_number: id,
  })
  if (error) throw new Error(`Unable to set the default caller ID: ${error.message}`)
  revalidatePath('/dashboard/settings/phone-numbers')
  revalidatePath('/dashboard/dialer')
}

export async function configurePhoneNumberInboundRoute(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const phoneNumberId = clean(formData, 'phone_number_id')
  const route = clean(formData, 'inbound_route')
  let ringGroupId: string | null = null
  let queueId: string | null = null
  if (route.startsWith('ring_group:')) ringGroupId = route.slice('ring_group:'.length).trim() || null
  else if (route.startsWith('queue:')) queueId = route.slice('queue:'.length).trim() || null
  else if (route !== 'none') throw new Error('Unsupported inbound route.')

  const { data: number, error: numberError } = await supabase
    .from('organization_phone_numbers')
    .select('provider,provider_number_id,phone_number')
    .eq('id', phoneNumberId)
    .eq('organization_id', organizationId)
    .single()
  if (numberError) throw new Error(numberError.message)

  const { error } = await supabase.rpc('configure_phone_number_inbound_route', {
    target_organization: organizationId,
    target_phone_number: phoneNumberId,
    target_ring_group: ringGroupId,
    target_queue: queueId,
  })
  if (error) throw new Error(`Unable to configure inbound routing: ${error.message}`)

  if (route !== 'none') {
    if (!number.provider_number_id) throw new Error('This Flowtix number must be synchronized by the platform before inbound routing can be enabled.')
    await configureProviderInboundRouting({
      organizationId,
      provider: 'signalwire',
      providerNumberId: number.provider_number_id,
      phoneNumber: number.phone_number,
    })
  }

  revalidatePath('/dashboard/settings/phone-numbers')
  revalidatePath('/dashboard/ring-groups')
}
