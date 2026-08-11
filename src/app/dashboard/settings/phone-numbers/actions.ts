'use server'

import { revalidatePath } from 'next/cache'

import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { assertPhoneNumberCapacity } from '@/lib/usage-limits'
import { configureProviderInboundRouting } from '@/lib/telephony/provider-admin'

const clean = (formData: FormData, key: string) =>
  String(formData.get(key) ?? '').trim()

export async function addPhoneNumber(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()

  if (!canManageSettings(role)) {
    throw new Error('Owner or admin access is required.')
  }

  await assertPhoneNumberCapacity(organizationId)

  const phone = clean(formData, 'phone_number')
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Use E.164 format, for example +15551234567.')
  }

  const { error } = await supabase.from('organization_phone_numbers').insert({
    organization_id: organizationId,
    phone_number: phone,
    friendly_name: clean(formData, 'friendly_name') || phone,
    provider: clean(formData, 'provider') || 'twilio',
    capabilities: {
      voice: formData.get('voice') === 'on',
      sms: formData.get('sms') === 'on',
    },
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/settings/phone-numbers')
}

export async function setDefaultPhoneNumber(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const id = clean(formData, 'id')
  await supabase.from('organization_phone_numbers').update({ is_default: false }).eq('organization_id', organizationId)
  const { error } = await supabase.from('organization_phone_numbers').update({ is_default: true }).eq('id', id).eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/settings/phone-numbers')
}

export async function removePhoneNumber(formData: FormData) {
  const { supabase, organizationId, role } = await requireSettingsContext()
  if (!canManageSettings(role)) throw new Error('Owner or admin access is required.')

  const { error } = await supabase.from('organization_phone_numbers').delete().eq('id', clean(formData, 'id')).eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/settings/phone-numbers')
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
    if (!number.provider_number_id) {
      throw new Error(`Re-import this ${number.provider} number before enabling inbound routing.`)
    }
    await configureProviderInboundRouting({
      organizationId,
      provider: number.provider,
      providerNumberId: number.provider_number_id,
      phoneNumber: number.phone_number,
    })
  }

  revalidatePath('/dashboard/settings/phone-numbers')
  revalidatePath('/dashboard/ring-groups')
}
