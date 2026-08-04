'use server'

import { revalidatePath } from 'next/cache'

import { canManageSettings, requireSettingsContext } from '@/lib/settings-context'
import { assertPhoneNumberCapacity } from '@/lib/usage-limits'

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
